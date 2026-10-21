-- v3 — credit-aware orders, receivables, one activity model (docs/CONTRACT.md § v3).
-- Expand + migrate in one file (small tables; Order is rewritten once by the enum swap).
-- Order of operations matters: new columns → status to TEXT → legacy SUBMITTED mapped with the
-- credit rule → new enum (SUBMITTED gone) → guards.

-- ---------------------------------------------------------------- columns
ALTER TABLE "Tenant" ADD COLUMN "approvalThresholdPaise" BIGINT;
ALTER TABLE "Shop" ADD COLUMN "openingOutstandingPaise" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "Order" ADD COLUMN "approvalReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "creditSnapshot" JSONB,
ADD COLUMN "settledAt" TIMESTAMP(3);

ALTER TABLE "OutboxEvent" ADD COLUMN "agentId" TEXT,
ADD COLUMN "memoId" TEXT,
ADD COLUMN "orderId" TEXT,
ADD COLUMN "pieceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "shopId" TEXT,
ADD COLUMN "visitId" TEXT;

-- ---------------------------------------------------------------- OrderStatus: SUBMITTED → CONFIRMED | PENDING_APPROVAL
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE TEXT USING ("status"::text);
DROP TYPE "OrderStatus";
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- Legacy orders were all "submitted for approval". Re-evaluate each SUBMITTED order with the v3
-- credit rule, per shop in createdAt order: exposure = opening (0 at migration) + Σ APPROVED +
-- Σ legacy orders already mapped to CONFIRMED + OUT memo exposure. If the shop has a limit and
-- exposure + total > limit → PENDING_APPROVAL (CREDIT_LIMIT); else CONFIRMED (and it now counts).
-- No tenant has a threshold yet, so ORDER_THRESHOLD cannot trip here. The frozen snapshot is
-- marked "legacy": true. Decided legacy orders (APPROVED/REJECTED) went through the old
-- "approve everything" flow: approvalRequired = true, reasons = {}, no snapshot.
DO $$
DECLARE
  o RECORD;
  base BIGINT;
  lim BIGINT;
  opening BIGINT;
  unsettled BIGINT;
  memo BIGINT;
  trips BOOLEAN;
BEGIN
  UPDATE "Order" SET "approvalRequired" = true WHERE "status" IN ('APPROVED', 'REJECTED');
  FOR o IN SELECT id, "tenantId", "shopId", "totalPaise" FROM "Order" WHERE "status" = 'SUBMITTED' ORDER BY "shopId", "createdAt", id LOOP
    SELECT s."creditLimitPaise", s."openingOutstandingPaise" INTO lim, opening FROM "Shop" s WHERE s.id = o."shopId";
    SELECT COALESCE(SUM(x."totalPaise"), 0) INTO unsettled FROM "Order" x
      WHERE x."shopId" = o."shopId" AND x."status" IN ('APPROVED', 'CONFIRMED') AND x."settledAt" IS NULL;
    SELECT COALESCE(SUM(mi."valuePaise"), 0) INTO memo FROM "MemoItem" mi JOIN "Memo" m ON m.id = mi."memoId"
      WHERE m."shopId" = o."shopId" AND mi."status" = 'OUT';
    base := opening + unsettled + memo;
    trips := lim > 0 AND base + o."totalPaise" > lim;
    UPDATE "Order" SET
      "status" = CASE WHEN trips THEN 'PENDING_APPROVAL' ELSE 'CONFIRMED' END,
      "approvalRequired" = trips,
      "approvalReasons" = CASE WHEN trips THEN ARRAY['CREDIT_LIMIT']::TEXT[] ELSE ARRAY[]::TEXT[] END,
      "creditSnapshot" = jsonb_build_object(
        'legacy', true,
        'creditLimitPaise', lim,
        'openingOutstandingPaise', opening,
        'unsettledOrdersPaise', unsettled,
        'outstandingPaise', opening + unsettled,
        'memoExposurePaise', memo,
        'exposurePaise', base,
        'availableCreditPaise', CASE WHEN lim > 0 THEN GREATEST(0, lim - base) END,
        'overLimit', lim > 0 AND base > lim,
        'approvalThresholdPaise', NULL,
        'orderAmountPaise', o."totalPaise",
        'projectedExposurePaise', base + o."totalPaise",
        'requiresApproval', trips,
        'reasons', CASE WHEN trips THEN '["CREDIT_LIMIT"]'::jsonb ELSE '[]'::jsonb END)
    WHERE id = o.id;
  END LOOP;
END $$;

-- Fails loudly if anything SUBMITTED (or unknown) is left.
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus" USING ("status"::"OrderStatus");

-- ---------------------------------------------------------------- activity refs back-fill
-- Same derivation as eventRefs() in apps/api/src/core/event-refs.ts (keep the two in step).
UPDATE "OutboxEvent" SET
  "shopId" = COALESCE(payload #>> '{data,shop,id}', payload #>> '{data,to,shopId}', payload #>> '{data,from,shopId}',
                      CASE WHEN "aggregateType" = 'Shop' THEN "aggregateId" END),
  "agentId" = COALESCE(payload #>> '{data,agent,id}', payload #>> '{data,agentRef,id}', payload #>> '{data,to,agentId}', payload #>> '{data,from,agentId}'),
  "visitId" = COALESCE(payload #>> '{data,visitId}', CASE WHEN "aggregateType" = 'Visit' THEN "aggregateId" END),
  "orderId" = COALESCE(payload #>> '{data,orderId}', CASE WHEN "aggregateType" = 'Order' THEN "aggregateId" END),
  "memoId" = COALESCE(payload #>> '{data,memoId}', payload #>> '{data,sourceMemoId}', CASE WHEN "aggregateType" = 'Memo' THEN "aggregateId" END),
  "pieceIds" = COALESCE(ARRAY(
    SELECT DISTINCT x FROM (
      SELECT p ->> 'id' AS x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payload #> '{data,pieces}') = 'array' THEN payload #> '{data,pieces}' ELSE '[]'::jsonb END) p
      UNION ALL
      SELECT i ->> 'pieceId' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payload #> '{data,items}') = 'array' THEN payload #> '{data,items}' ELSE '[]'::jsonb END) i
    ) q WHERE x IS NOT NULL ORDER BY x), ARRAY[]::TEXT[]);

-- ---------------------------------------------------------------- indexes
CREATE INDEX "Order_tenantId_shopId_status_idx" ON "Order"("tenantId", "shopId", "status");
CREATE INDEX "OutboxEvent_tenantId_shopId_createdAt_idx" ON "OutboxEvent"("tenantId", "shopId", "createdAt");
CREATE INDEX "OutboxEvent_tenantId_agentId_createdAt_idx" ON "OutboxEvent"("tenantId", "agentId", "createdAt");
CREATE INDEX "OutboxEvent_tenantId_visitId_createdAt_idx" ON "OutboxEvent"("tenantId", "visitId", "createdAt");
CREATE INDEX "OutboxEvent_tenantId_orderId_createdAt_idx" ON "OutboxEvent"("tenantId", "orderId", "createdAt");
CREATE INDEX "OutboxEvent_tenantId_memoId_createdAt_idx" ON "OutboxEvent"("tenantId", "memoId", "createdAt");
CREATE INDEX "OutboxEvent_pieceIds_idx" ON "OutboxEvent" USING GIN ("pieceIds");

-- =====================================================================
-- Hand-written invariants (Prisma cannot express these).
-- =====================================================================
-- Receivables and thresholds are non-negative paise; a threshold, when set, is positive.
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_credit_nonneg" CHECK ("creditLimitPaise" >= 0 AND "openingOutstandingPaise" >= 0);
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_approval_threshold_positive" CHECK ("approvalThresholdPaise" IS NULL OR "approvalThresholdPaise" > 0);
-- Approval reasons come from a closed set, and a pending order always says why it is pending.
ALTER TABLE "Order" ADD CONSTRAINT "Order_approval_reasons_known" CHECK ("approvalReasons" IS NOT NULL AND "approvalReasons" <@ ARRAY['CREDIT_LIMIT', 'ORDER_THRESHOLD']::TEXT[]);
ALTER TABLE "Order" ADD CONSTRAINT "Order_pending_has_reason" CHECK ("status" <> 'PENDING_APPROVAL' OR ("approvalRequired" AND cardinality("approvalReasons") > 0));
-- Only money that is owed can be settled; cancelled ⇔ cancelledAt; a settled order is never cancelled.
ALTER TABLE "Order" ADD CONSTRAINT "Order_settled_only_when_owed" CHECK ("settledAt" IS NULL OR "status" IN ('CONFIRMED', 'APPROVED'));
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelled_at" CHECK (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL));
-- Activity refs list is never NULL (empty array when the event names no pieces).
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_pieceIds_not_null" CHECK ("pieceIds" IS NOT NULL);
