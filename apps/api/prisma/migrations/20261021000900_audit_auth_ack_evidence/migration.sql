-- Final backend audit (docs/AUDIT-SYNC.md §4 B7, B8). Expand only: nullable columns and constant-default
-- booleans (metadata-only on Postgres ≥ 11, no table rewrite), CHECKs added NOT VALID (no scan under lock);
-- they are validated in 20261021001000. Reversible: DROP CONSTRAINT …; DROP COLUMN ….

-- B7 refresh-token reuse grace window
ALTER TABLE "RefreshToken" ADD COLUMN "rotatedAt" TIMESTAMP(3);

-- B8 self-acknowledgement evidence
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "lastSeenIp" TEXT,
  ADD COLUMN "lastSeenUa" TEXT;
ALTER TABLE "Memo" ADD COLUMN "ackIp" TEXT,
  ADD COLUMN "ackUserAgent" TEXT,
  ADD COLUMN "ackViewSuspected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selfAckSuspected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selfAckReason" TEXT;

-- =====================================================================
-- Hand-written invariants (Prisma cannot express these).
-- =====================================================================
-- A rotated token is a revoked token (the grace window never re-opens a live one).
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_rotated_is_revoked" CHECK ("rotatedAt" IS NULL OR "revokedAt" IS NOT NULL) NOT VALID;
-- A self-ack reason exists exactly when the ack is flagged, and only on an acknowledged memo.
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_self_ack_consistent" CHECK (
  ("selfAckSuspected" = ("selfAckReason" IS NOT NULL))
  AND ("selfAckReason" IS NULL OR "selfAckReason" IN ('AGENT_SESSION', 'AGENT_DEVICE', 'CODE_VIEWED_ON_AGENT_DEVICE'))
  AND (NOT "selfAckSuspected" OR "ackStatus" = 'ACKNOWLEDGED')
) NOT VALID;
