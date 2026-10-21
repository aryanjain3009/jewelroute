-- ROLLBACK of v3 (migrations 20261021000300 … 20261021000800) — docs/DECISIONS.md › "Rollback plan (v3)".
-- NOT a Prisma migration (Prisma never runs files in prisma/rollback/). Run it by hand, once, against the
-- database, then redeploy the pre-v3 build (commit before e40e83f):
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f apps/api/prisma/rollback/20261021000300_v3_down.sql
-- One transaction: it either fully applies or changes nothing. It rewrites "Order" (twice) and
-- "CustodyEvent" (the largest table) under ACCESS EXCLUSIVE locks — run it in a maintenance window. Tested by apps/api/test/v3.test.ts V11
-- (forward → down → forward on a scratch database).
--
-- Status mapping (old enum: DRAFT | SUBMITTED | APPROVED | REJECTED):
--   CONFIRMED, PENDING_APPROVAL → SUBMITTED   (confirmed orders re-enter the old approval queue)
--   CANCELLED                   → REJECTED    (rejectionReason = 'Cancelled: <reason>', decidedAt = cancelledAt)
--   CustodyEvent reason SALE_REJECTED → ADJUSTMENT (ledger rows are append-only; the column type is
--   rewritten with USING, which does not fire the row trigger — the rows themselves are kept)
-- DATA LOST (export first if it matters): Order.settledAt (which orders were paid), approvalRequired,
--   approvalReasons, creditSnapshot, cancelledAt/cancellationReason (folded into rejectionReason),
--   Shop.openingOutstandingPaise, Tenant.approvalThresholdPaise, the OutboxEvent ref columns.
-- KEPT: v3 outbox rows (order.confirmed, memo.acknowledged, …) — old code titles unknown types by type;
--   webhook endpoints subscribed to v3 events simply stop receiving them.

BEGIN;

-- 1. v3 guards and triggers
DROP TRIGGER IF EXISTS "SamplePiece_sold_has_live_order" ON "SamplePiece";
DROP TRIGGER IF EXISTS "Order_dead_unsells_pieces" ON "Order";
DROP FUNCTION IF EXISTS jr_piece_sold_guard();
DROP FUNCTION IF EXISTS jr_order_dead_guard();
DROP FUNCTION IF EXISTS jr_check_sold_piece(TEXT);
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_no_submitted",
  DROP CONSTRAINT IF EXISTS "Order_approval_reasons_known",
  DROP CONSTRAINT IF EXISTS "Order_pending_has_reason",
  DROP CONSTRAINT IF EXISTS "Order_settled_only_when_owed",
  DROP CONSTRAINT IF EXISTS "Order_cancelled_at";
ALTER TABLE "Shop" DROP CONSTRAINT IF EXISTS "Shop_credit_nonneg";
ALTER TABLE "Tenant" DROP CONSTRAINT IF EXISTS "Tenant_approval_threshold_positive";
ALTER TABLE "OutboxEvent" DROP CONSTRAINT IF EXISTS "OutboxEvent_pieceIds_not_null";
DROP INDEX IF EXISTS "Order_tenantId_shopId_status_idx";
DROP INDEX IF EXISTS "OrderItem_pieceId_idx";
DROP INDEX IF EXISTS "OrderItem_orderId_idx";

-- 2. OrderStatus back to the v2 enum
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE TEXT USING ("status"::text);
UPDATE "Order" SET "status" = 'SUBMITTED' WHERE "status" IN ('CONFIRMED', 'PENDING_APPROVAL');
UPDATE "Order" SET "status" = 'REJECTED',
  "rejectionReason" = COALESCE("rejectionReason", 'Cancelled: ' || COALESCE("cancellationReason", 'no reason given')),
  "decidedAt" = COALESCE("decidedAt", "cancelledAt")
  WHERE "status" = 'CANCELLED';
DROP TYPE "OrderStatus";
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus" USING ("status"::"OrderStatus");
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

-- 3. CustodyReason back to the v2 enum (SALE_REJECTED → ADJUSTMENT)
ALTER TYPE "CustodyReason" RENAME TO "CustodyReason_v3";
CREATE TYPE "CustodyReason" AS ENUM ('INTAKE', 'ISSUE_TO_AGENT', 'MEMO_HANDOVER', 'MEMO_RETURN', 'RETURN_TO_VAULT', 'CONVERTED_TO_SALE', 'ADJUSTMENT');
ALTER TABLE "CustodyEvent" ALTER COLUMN "reason" TYPE "CustodyReason"
  USING (CASE "reason"::text WHEN 'SALE_REJECTED' THEN 'ADJUSTMENT' ELSE "reason"::text END)::"CustodyReason";
DROP TYPE "CustodyReason_v3";

-- 4. v3 columns (their indexes go with them)
ALTER TABLE "Order" DROP COLUMN IF EXISTS "approvalReasons", DROP COLUMN IF EXISTS "approvalRequired",
  DROP COLUMN IF EXISTS "cancellationReason", DROP COLUMN IF EXISTS "cancelledAt",
  DROP COLUMN IF EXISTS "creditSnapshot", DROP COLUMN IF EXISTS "settledAt";
ALTER TABLE "Shop" DROP COLUMN IF EXISTS "openingOutstandingPaise";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "approvalThresholdPaise";
ALTER TABLE "OutboxEvent" DROP COLUMN IF EXISTS "shopId", DROP COLUMN IF EXISTS "agentId", DROP COLUMN IF EXISTS "visitId",
  DROP COLUMN IF EXISTS "orderId", DROP COLUMN IF EXISTS "memoId", DROP COLUMN IF EXISTS "pieceIds";

-- 5. Migration history: the pre-v3 build must not see v3 migrations as applied (and a later
--    forward deploy re-applies them cleanly).
DELETE FROM "_prisma_migrations" WHERE migration_name IN (
  '20261021000300_v3_credit_activity', '20261021000400_v3_expand_enums',
  '20261021000500_v3_sale_guards', '20261021000600_v3_validate_no_submitted',
  '20261021000700_orderitem_pieceid_idx', '20261021000800_orderitem_orderid_idx');

COMMIT;
