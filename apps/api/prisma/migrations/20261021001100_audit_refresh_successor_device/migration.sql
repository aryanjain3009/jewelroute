-- Audit review (docs/brain/reviews/2026-10-21-audit-api-review.md) M1 + M3. Expand only: nullable columns, CHECKs
-- NOT VALID (validated in 20261021001300). lock_timeout so an ALTER queued behind a long transaction fails fast
-- instead of stalling every authenticated request (review m5). Reversible: prisma/rollback/20261021000900_audit_down.sql.
SET lock_timeout = '3s';

ALTER TABLE "RefreshToken" ADD COLUMN "successorId" TEXT,
  ADD COLUMN "graceUsedAt" TIMESTAMP(3),
  ADD COLUMN "deviceHash" TEXT;

-- =====================================================================
-- Hand-written invariants (Prisma cannot express these).
-- =====================================================================
-- Only a rotated token has a successor, and only a rotated token can have spent its one grace reuse.
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_successor_needs_rotation" CHECK ("successorId" IS NULL OR "rotatedAt" IS NOT NULL) NOT VALID;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_grace_needs_successor" CHECK ("graceUsedAt" IS NULL OR "successorId" IS NOT NULL) NOT VALID;

RESET lock_timeout;
