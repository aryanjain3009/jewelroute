-- v3 re-review n1: jr_order_dead_guard() (20261021000500) lists an order's items by "orderId" whenever any
-- order is rejected or cancelled (also used by order views). Own file for CONCURRENTLY. Reversible: DROP INDEX.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
