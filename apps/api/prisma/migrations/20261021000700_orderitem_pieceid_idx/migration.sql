-- v3 re-review n1: jr_check_sold_piece() (20261021000500) looks up OrderItem by "pieceId" at every commit
-- that sells a piece or ends a conversion. One statement per file so CONCURRENTLY runs outside a transaction
-- block and never blocks writes to the append-only, ever-growing OrderItem table. Reversible: DROP INDEX.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OrderItem_pieceId_idx" ON "OrderItem"("pieceId");
