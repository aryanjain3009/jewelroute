-- ROLLBACK of the two assignment-integrity migrations. NOT a Prisma migration.
-- Recreate the legacy rule first so an older build keeps its expected constraint.
-- This intentionally fails if cancelled duplicate rows must be resolved by a human.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Visit_tenantId_agentId_shopId_plannedDate_key"
ON "Visit" ("tenantId", "agentId", "shopId", "plannedDate");

DROP INDEX CONCURRENTLY IF EXISTS "Visit_one_shop_per_day";

BEGIN;
DELETE FROM "_prisma_migrations" WHERE migration_name IN (
  '20261022000200_visit_one_shop_per_day',
  '20261022000210_drop_legacy_visit_assignment_unique'
);
COMMIT;
