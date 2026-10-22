-- ROLLBACK of 20261022000100_order_tenant_created_idx and 20261022000110_memo_extension_memo_idx. NOT a Prisma
-- migration. Rollbacks run newest first: run THIS before 20261022000000_session_timezone_down.sql.
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f apps/api/prisma/rollback/20261022000100_hot_path_indexes_down.sql
-- Forgets the migrations only. The two indexes stay: an older build never names them, they only speed its reads,
-- and the migrations use IF NOT EXISTS, so going forward again is a no-op. To remove them anyway, run outside a
-- transaction: DROP INDEX CONCURRENTLY IF EXISTS "Order_tenantId_createdAt_idx"; DROP INDEX CONCURRENTLY IF EXISTS "MemoExtension_memoId_idx";
BEGIN;
DELETE FROM "_prisma_migrations" WHERE migration_name IN ('20261022000100_order_tenant_created_idx', '20261022000110_memo_extension_memo_idx');
COMMIT;
