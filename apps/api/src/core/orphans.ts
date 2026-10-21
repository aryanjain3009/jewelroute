/* Read-only integrity check (v3 re-review n3): SOLD pieces that no live order sold — e.g. a memo
 * conversion rejected before reject un-sold pieces (pre-14a7a60), or by a pre-v3 build during a rollback
 * window. The deferred triggers from 20261021000500 stop NEW orphans; this finds old ones. Never repairs:
 * an orphan needs a human decision (which shop holds it, was it paid). Same predicate as jr_check_sold_piece(). */
import type { PrismaClient } from '../../generated/prisma';

export interface SoldOrphan {
  tenantId: string;
  pieceId: string;
  tagCode: string;
  lastOrderId: string | null;
  lastOrderNumber: string | null;
  lastOrderStatus: string | null;
}

export function findSoldOrphans(db: PrismaClient): Promise<SoldOrphan[]> {
  return db.$queryRaw<SoldOrphan[]>`
    SELECT sp."tenantId", sp.id AS "pieceId", sp."tagCode",
           lo.id AS "lastOrderId", lo.number AS "lastOrderNumber", lo.status::text AS "lastOrderStatus"
    FROM "SamplePiece" sp
    LEFT JOIN LATERAL (
      SELECT o.id, o.number, o.status FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
      WHERE oi."pieceId" = sp.id ORDER BY o."createdAt" DESC LIMIT 1
    ) lo ON true
    WHERE sp."custodianType" = 'SOLD'
      AND NOT EXISTS (SELECT 1 FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
                      WHERE oi."pieceId" = sp.id AND o.status NOT IN ('REJECTED', 'CANCELLED'))
    ORDER BY sp."tenantId", sp."tagCode"`;
}
