import { Injectable } from '@nestjs/common';
import type { Tx } from '../prisma.service';
import type { ReqCtx } from '../common/context';
import { toJson } from './outbox';

@Injectable()
export class AuditService {
  async log(tx: Tx, ctx: ReqCtx, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown) {
    await tx.auditLog.create({
      data: {
        tenantId: ctx.user.tid,
        actorId: ctx.user.sub,
        action,
        entityType,
        entityId,
        before: before === undefined || before === null ? undefined : toJson(before),
        after: after === undefined || after === null ? undefined : toJson(after),
        requestId: ctx.requestId || null,
        ip: ctx.ip || null,
      },
    });
  }
}
