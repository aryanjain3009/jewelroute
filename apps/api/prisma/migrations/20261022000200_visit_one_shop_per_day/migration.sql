-- A retailer can appear on only one active sales route per business day.
-- CANCELLED rows remain as audit history and do not reserve the shop/day slot.
-- This is intentionally the migration's only statement so Postgres can build
-- the index without blocking reads or writes for the duration of the scan.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Visit_one_shop_per_day"
ON "Visit" ("tenantId", "shopId", "plannedDate")
WHERE status <> 'CANCELLED';
