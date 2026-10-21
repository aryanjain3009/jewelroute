/* v3 credit position — the ONE place that turns Postgres rows into a CreditPosition
 * (docs/CONTRACT.md § v3). The arithmetic itself is `creditPosition` in @jewelroute/shared. */
import { Injectable } from '@nestjs/common';
import { creditPosition, CreditPosition } from '@jewelroute/shared';
import { PrismaService, Tx } from '../prisma.service';
import { notFound } from '../common/errors';

export type ShopCredit = CreditPosition & { shopId: string; asOf: string };

const num = (v: bigint | number | null | undefined) => (v == null ? 0 : Number(v));

@Injectable()
export class CreditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Position of one shop, optionally for a prospective order amount. With `lock` (inside a write
   * transaction) the shop row is taken `FOR UPDATE` first, so two concurrent orders at the same shop
   * are evaluated one after the other and cannot both slip under the limit (READ COMMITTED: the
   * second sees the first's committed order once it gets the lock).
   * `excludeMemoPieceIds` (read-only memo-convert preview): those pieces' OUT memo value is left out of
   * memo exposure — exactly what the conversion does before it runs this rule — so the preview and the
   * convert evaluate the same numbers.
   */
  async position(tid: string, shopId: string, opts: { tx?: Tx; amountPaise?: number; lock?: boolean; excludeMemoPieceIds?: string[] } = {}): Promise<ShopCredit> {
    const db = opts.tx ?? this.prisma.db;
    const rows = opts.lock
      ? await db.$queryRaw<{ creditLimitPaise: bigint; openingOutstandingPaise: bigint }[]>`
          SELECT "creditLimitPaise", "openingOutstandingPaise" FROM "Shop" WHERE id = ${shopId} AND "tenantId" = ${tid} FOR UPDATE`
      : await db.$queryRaw<{ creditLimitPaise: bigint; openingOutstandingPaise: bigint }[]>`
          SELECT "creditLimitPaise", "openingOutstandingPaise" FROM "Shop" WHERE id = ${shopId} AND "tenantId" = ${tid}`;
    if (!rows.length) throw notFound('Shop');
    const skip = opts.excludeMemoPieceIds ?? [];
    const [tenant, unsettled, memo] = await Promise.all([
      db.tenant.findUniqueOrThrow({ where: { id: tid }, select: { approvalThresholdPaise: true } }),
      db.order.aggregate({ where: { tenantId: tid, shopId, status: { in: ['CONFIRMED', 'APPROVED'] }, settledAt: null }, _sum: { totalPaise: true } }),
      db.$queryRaw<{ v: bigint | null }[]>`
        SELECT sum(mi."valuePaise") AS v FROM "MemoItem" mi JOIN "Memo" m ON m.id = mi."memoId"
        WHERE m."tenantId" = ${tid} AND m."shopId" = ${shopId} AND mi.status = 'OUT' AND NOT (mi."pieceId" = ANY(${skip}::text[]))`,
    ]);
    const p = creditPosition({
      creditLimitPaise: num(rows[0].creditLimitPaise),
      openingOutstandingPaise: num(rows[0].openingOutstandingPaise),
      unsettledOrdersPaise: num(unsettled._sum.totalPaise),
      memoExposurePaise: num(memo[0]?.v),
      approvalThresholdPaise: tenant.approvalThresholdPaise == null ? null : Number(tenant.approvalThresholdPaise),
      orderAmountPaise: opts.amountPaise ?? 0,
    });
    return { shopId, ...p, asOf: new Date().toISOString() };
  }

  /** Positions for many shops (no prospective order) in three grouped queries — for ShopRow lists. */
  async positions(
    tid: string,
    shops: { id: string; creditLimitPaise: bigint | number; openingOutstandingPaise: bigint | number }[],
    memoExposure: Map<string, number>,
  ): Promise<Map<string, ShopCredit>> {
    const out = new Map<string, ShopCredit>();
    if (!shops.length) return out;
    const db = this.prisma.db;
    const [tenant, unsettled] = await Promise.all([
      db.tenant.findUniqueOrThrow({ where: { id: tid }, select: { approvalThresholdPaise: true } }),
      db.order.groupBy({ by: ['shopId'], where: { tenantId: tid, shopId: { in: shops.map((s) => s.id) }, status: { in: ['CONFIRMED', 'APPROVED'] }, settledAt: null }, _sum: { totalPaise: true } }),
    ]);
    const U = new Map(unsettled.map((u) => [u.shopId, num(u._sum.totalPaise)]));
    const asOf = new Date().toISOString();
    for (const s of shops) {
      const p = creditPosition({
        creditLimitPaise: num(s.creditLimitPaise),
        openingOutstandingPaise: num(s.openingOutstandingPaise),
        unsettledOrdersPaise: U.get(s.id) ?? 0,
        memoExposurePaise: memoExposure.get(s.id) ?? 0,
        approvalThresholdPaise: tenant.approvalThresholdPaise == null ? null : Number(tenant.approvalThresholdPaise),
      });
      out.set(s.id, { shopId: s.id, ...p, asOf });
    }
    return out;
  }
}
