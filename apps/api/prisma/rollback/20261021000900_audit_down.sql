-- ROLLBACK of the final-audit migrations 20261021000900 … 20261021001300 (docs/AUDIT-SYNC.md §4 B7, B8; review M1, M3, m6).
-- NOT a Prisma migration. Rollbacks run newest first: run THIS before 20261021000300_v3_down.sql.
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f apps/api/prisma/rollback/20261021000900_audit_down.sql
-- One transaction; only drops columns and constraints (catalog changes, brief ACCESS EXCLUSIVE, no rewrite).
-- DATA LOST: refresh-token grace stamps, successor links and device hashes (two-tab refreshes revert to 401 + family revocation), agents' last-seen
-- device, retailer-ack evidence (ackIp, ackUserAgent, selfAckSuspected/Reason). Redeploy a build before 1736cd4.
-- Tested by apps/api/test/v3.test.ts V11 (forward → down scripts → forward on a scratch database).
BEGIN;
SET LOCAL lock_timeout = '3s';
DROP INDEX IF EXISTS "RefreshToken_userId_idx";
ALTER TABLE "RefreshToken" DROP CONSTRAINT IF EXISTS "RefreshToken_successor_needs_rotation";
ALTER TABLE "RefreshToken" DROP CONSTRAINT IF EXISTS "RefreshToken_grace_needs_successor";
ALTER TABLE "RefreshToken" DROP COLUMN IF EXISTS "successorId", DROP COLUMN IF EXISTS "graceUsedAt", DROP COLUMN IF EXISTS "deviceHash";
ALTER TABLE "Memo" DROP CONSTRAINT IF EXISTS "Memo_self_ack_consistent";
ALTER TABLE "RefreshToken" DROP CONSTRAINT IF EXISTS "RefreshToken_rotated_is_revoked";
ALTER TABLE "Memo" DROP COLUMN IF EXISTS "ackIp", DROP COLUMN IF EXISTS "ackUserAgent", DROP COLUMN IF EXISTS "ackViewSuspected",
  DROP COLUMN IF EXISTS "selfAckSuspected", DROP COLUMN IF EXISTS "selfAckReason";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lastSeenAt", DROP COLUMN IF EXISTS "lastSeenIp", DROP COLUMN IF EXISTS "lastSeenUa";
ALTER TABLE "RefreshToken" DROP COLUMN IF EXISTS "rotatedAt";
DELETE FROM "_prisma_migrations" WHERE migration_name IN ('20261021000900_audit_auth_ack_evidence', '20261021001000_audit_validate_checks',
  '20261021001100_audit_refresh_successor_device', '20261021001200_refreshtoken_userid_idx', '20261021001300_audit_validate_refresh_checks');
COMMIT;
