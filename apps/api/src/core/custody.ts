import { Injectable } from '@nestjs/common';
import type { CustodianType, CustodyReason } from '../../generated/prisma';
import type { Tx } from '../prisma.service';
import type { ReqCtx } from '../common/context';
import { conflict, notFound } from '../common/errors';
import { AuditService } from './audit';
import { OutboxService } from './outbox';

export interface Custodian {
  type: CustodianType;
  agentId?: string | null;
  shopId?: string | null;
}

interface LockedPiece {
  id: string;
  tagCode: string;
  custodianType: CustodianType;
  custodianAgentId: string | null;
  custodianShopId: string | null;
  custodySeq: number;
}

export interface MoveInput {
  pieceIds: string[];
  /** Expected current custodian — verified under row lock. */
  from: Custodian;
  to: Custodian;
  reason: CustodyReason;
  memoId?: string;
  memoNumber?: string;
  visitId?: string;
  /** Error code when a piece is not with the expected custodian. */
  notHeldCode?: string;
}

const same = (p: LockedPiece, c: Custodian) =>
  p.custodianType === c.type && (p.custodianAgentId ?? null) === (c.agentId ?? null) && (p.custodianShopId ?? null) === (c.shopId ?? null);

@Injectable()
export class CustodyService {
  constructor(
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async label(tx: Tx, tenantId: string, c: Custodian): Promise<string> {
    if (c.type === 'AGENT' && c.agentId) return (await tx.user.findFirst({ where: { id: c.agentId, tenantId }, select: { name: true } }))?.name ?? 'Agent';
    if (c.type === 'SHOP' && c.shopId) return (await tx.shop.findFirst({ where: { id: c.shopId, tenantId }, select: { name: true } }))?.name ?? 'Shop';
    return { VAULT: 'Vault', SOLD: 'Sold', LOST: 'Lost', AGENT: 'Agent', SHOP: 'Shop' }[c.type];
  }

  /**
   * Lock pieces FOR UPDATE in id order (deadlock-free), verify the current custodian, move them,
   * append a CustodyEvent per piece with the next gap-free seq, and emit sample.custody_changed —
   * all inside the caller's transaction.
   */
  async move(tx: Tx, ctx: ReqCtx, m: MoveInput) {
    const tenantId = ctx.user.tid;
    const ids = [...new Set(m.pieceIds)].sort();
    if (!ids.length) throw conflict('NO_PIECES', 'Select at least one piece');
    const locked = await tx.$queryRaw<LockedPiece[]>`
      SELECT id, "tagCode", "custodianType", "custodianAgentId", "custodianShopId", "custodySeq"
      FROM "SamplePiece" WHERE "tenantId" = ${tenantId} AND id = ANY(${ids}) ORDER BY id FOR UPDATE`;
    if (locked.length !== ids.length) {
      const found = new Set(locked.map((p) => p.id));
      throw notFound(`Piece(s) ${ids.filter((i) => !found.has(i)).join(', ')}`);
    }
    const wrong = locked.filter((p) => !same(p, m.from));
    if (wrong.length) {
      throw conflict(m.notHeldCode ?? 'PIECE_NOT_IN_YOUR_CUSTODY', `${wrong.map((p) => p.tagCode).join(', ')} ${wrong.length === 1 ? 'is' : 'are'} not with the expected custodian`, {
        pieceIds: wrong.map((p) => p.id),
        tagCodes: wrong.map((p) => p.tagCode),
      });
    }
    const toAgent = m.to.type === 'AGENT' ? m.to.agentId! : null;
    const toShop = m.to.type === 'SHOP' ? m.to.shopId! : null;
    const now = new Date();
    const eventId = this.outbox.newId();
    for (const p of locked) {
      const seq = p.custodySeq + 1;
      await tx.samplePiece.update({
        where: { id: p.id },
        data: { custodianType: m.to.type, custodianAgentId: toAgent, custodianShopId: toShop, custodySeq: seq },
      });
      await tx.custodyEvent.create({
        data: {
          tenantId,
          pieceId: p.id,
          seq,
          fromType: p.custodianType,
          fromAgentId: p.custodianAgentId,
          fromShopId: p.custodianShopId,
          toType: m.to.type,
          toAgentId: toAgent,
          toShopId: toShop,
          reason: m.reason,
          memoId: m.memoId,
          visitId: m.visitId,
          actorId: ctx.user.sub,
          outboxEventId: eventId,
          occurredAt: now,
        },
      });
    }
    const [fromLabel, toLabel] = await Promise.all([this.label(tx, tenantId, m.from), this.label(tx, tenantId, m.to)]);
    const data = {
      pieces: locked.map((p) => ({ id: p.id, tagCode: p.tagCode, seq: p.custodySeq + 1 })),
      pieceCount: locked.length,
      from: { type: m.from.type, agentId: m.from.agentId ?? undefined, shopId: m.from.shopId ?? undefined },
      to: { type: m.to.type, agentId: toAgent ?? undefined, shopId: toShop ?? undefined },
      fromLabel,
      toLabel,
      reason: m.reason,
      memoId: m.memoId,
      memoNumber: m.memoNumber,
      visitId: m.visitId,
      actor: { id: ctx.user.sub, name: ctx.user.name ?? '' },
    };
    await this.outbox.emit(tx, {
      id: eventId,
      tenantId,
      tenantSlug: ctx.user.tslug,
      type: 'sample.custody_changed',
      aggregateType: 'SamplePiece',
      aggregateId: locked[0].id,
      actorId: ctx.user.sub,
      data,
    });
    await this.audit.log(tx, ctx, 'custody.move', 'SamplePiece', ids.join(','), { custodian: m.from }, { custodian: m.to, reason: m.reason, memoId: m.memoId });
    return Object.assign(locked, { eventId });
  }
}

/** Gap-free per-tenant document numbers: ORD-2026-00042, MEMO-2026-00017 (row-locked upsert). */
export async function nextDocNumber(tx: Tx, tenantId: string, kind: 'ORD' | 'MEMO' | 'TAG', year = new Date().getUTCFullYear()): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    INSERT INTO "DocSequence" ("tenantId", kind, year, next) VALUES (${tenantId}, ${kind}, ${year}, 2)
    ON CONFLICT ("tenantId", kind, year) DO UPDATE SET next = "DocSequence".next + 1
    RETURNING next - 1 AS n`;
  return Number(rows[0].n);
}
export const fmtDoc = (kind: string, year: number, n: number) => `${kind}-${year}-${String(n).padStart(5, '0')}`;
