import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { PrismaService, Tx } from '../prisma.service';
import type { ReqCtx } from '../common/context';
import { sha256 } from '../common/crypto';
import { AppError, badRequest, unprocessable } from '../common/errors';
import { toJson } from './outbox';

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * Idempotency-Key handling.
 *  1. Inside the business transaction we INSERT the (tenantId,key) row first with ON CONFLICT DO NOTHING.
 *     A concurrent duplicate blocks on that unique slot until the first transaction commits/rolls back.
 *  2. Winner runs the operation and stores the response in the same transaction (atomic with the effect).
 *  3. Loser sees the committed row: same fingerprint → returns stored response; different body → 422.
 *  Failed operations roll the key row back too, so a retry after an error re-executes.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates that move money or custody must carry a key, so a client retry can never duplicate them. */
  require(ctx: ReqCtx) {
    if (!ctx.idempotencyKey) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header (one UUID per user action, reused on retries)');
  }

  fingerprint(ctx: ReqCtx) {
    return sha256(`${ctx.method} ${ctx.path} ${stable(ctx.body)}`);
  }

  async run<T>(ctx: ReqCtx, fn: (tx: Tx, clientOpId: string) => Promise<T>): Promise<T> {
    const key = ctx.idempotencyKey;
    if (!key) return this.prisma.tx((tx) => fn(tx, ulid()));
    const fp = this.fingerprint(ctx);
    const tenantId = ctx.user.tid;
    const out = await this.prisma.tx(async (tx) => {
      const inserted = await tx.$queryRaw<{ key: string }[]>`
        INSERT INTO "IdempotencyKey" ("tenantId", key, "userId", fingerprint, "createdAt")
        VALUES (${tenantId}, ${key}, ${ctx.user.sub}, ${fp}, now())
        ON CONFLICT ("tenantId", key) DO NOTHING RETURNING key`;
      if (inserted.length === 0) {
        const existing = await tx.idempotencyKey.findUnique({ where: { tenantId_key: { tenantId, key } } });
        return { replay: existing };
      }
      const result = toJson(await fn(tx, key));
      await tx.idempotencyKey.update({ where: { tenantId_key: { tenantId, key } }, data: { responseStatus: 200, responseBody: result } });
      return { result };
    });
    if ('result' in out) return out.result as T;
    const existing = out.replay;
    if (!existing) throw new AppError(409, 'IDEMPOTENCY_RETRY', 'Please retry the request');
    if (existing.fingerprint !== fp || existing.userId !== ctx.user.sub) {
      throw unprocessable('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request');
    }
    if (existing.responseBody == null) throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'The original request is still in progress');
    return existing.responseBody as T;
  }
}
