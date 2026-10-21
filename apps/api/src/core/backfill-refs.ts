/* Batched, idempotent back-fill of the v3 OutboxEvent activity refs (T3 review M1).
 * Uses eventRefs() — the same derivation every live write uses — so the back-fill cannot drift from
 * OutboxService.emit (review m1). Touches only rows that carry no ref at all, keyset-paged by id,
 * `batch` rows per transaction, so it never holds a long lock and re-running it is a no-op.
 * Runs after `prisma migrate deploy`: Vercel build (scripts/backfill-on-vercel.cjs), scripts/run-local.sh,
 * or by hand: `pnpm --filter @jewelroute/api db:backfill-activity-refs`. */
import type { PrismaClient } from '../../generated/prisma';
import { eventRefs } from './event-refs';

export interface BackfillStats {
  scanned: number;
  updated: number;
  batches: number;
}

export async function backfillActivityRefs(db: PrismaClient, opts: { batch?: number; log?: (m: string) => void } = {}): Promise<BackfillStats> {
  const batch = opts.batch ?? 1000;
  const stats: BackfillStats = { scanned: 0, updated: 0, batches: 0 };
  let cursor = '';
  for (;;) {
    const rows = await db.outboxEvent.findMany({
      where: { id: { gt: cursor }, type: { not: 'ping' }, shopId: null, agentId: null, visitId: null, orderId: null, memoId: null, pieceIds: { isEmpty: true } },
      select: { id: true, aggregateType: true, aggregateId: true, payload: true },
      orderBy: { id: 'asc' },
      take: batch,
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    stats.scanned += rows.length;
    stats.batches++;
    const updates = rows
      .map((r) => ({ id: r.id, refs: eventRefs(r.aggregateType, r.aggregateId, ((r.payload as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>) }))
      .filter((u) => u.refs.shopId || u.refs.agentId || u.refs.visitId || u.refs.orderId || u.refs.memoId || u.refs.pieceIds.length);
    if (updates.length) await db.$transaction(updates.map((u) => db.outboxEvent.update({ where: { id: u.id }, data: u.refs })));
    stats.updated += updates.length;
    opts.log?.(`[backfill-activity-refs] batch ${stats.batches}: scanned ${rows.length}, updated ${updates.length}`);
    if (rows.length < batch) break;
  }
  return stats;
}
