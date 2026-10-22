-- ROLLBACK of 20261022000000_session_timezone_utc. NOT a Prisma migration. Rollbacks run newest first: run THIS
-- before 20261021000900_audit_down.sql.
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f apps/api/prisma/rollback/20261022000000_session_timezone_down.sql
-- Forgets the migration only. The database default timezone stays UTC on purpose: every earlier build assumes
-- UTC sessions too (its raw SQL compares UTC timestamps with now()), so resetting it would bring the bug back.
BEGIN;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261022000000_session_timezone_utc';
COMMIT;
