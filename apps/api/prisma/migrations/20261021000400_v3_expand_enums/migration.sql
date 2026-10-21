-- v3 follow-up (T3 review B1/B2, docs/brain/reviews/2026-10-21-v3-credit-activity.md).
-- Expand only: enum values are added in their own migration because a value added by
-- ALTER TYPE … ADD VALUE cannot be used in the same transaction.
-- * OrderStatus.SUBMITTED comes back (20261021000300 dropped it in the same release as the code
--   switch). It exists only so prisma/rollback/20261021000300_v3_down.sql and a still-serving
--   older deployment have the value; CHECK "Order_no_submitted" (next migrations) forbids new rows.
--   A later contract migration drops it.
-- * CustodyReason.SALE_REJECTED: rejecting a memo-converted order moves its pieces SOLD → SHOP.
-- Reversible: the down script maps SALE_REJECTED → ADJUSTMENT and recreates the old enums.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED' BEFORE 'PENDING_APPROVAL';
ALTER TYPE "CustodyReason" ADD VALUE IF NOT EXISTS 'SALE_REJECTED';
