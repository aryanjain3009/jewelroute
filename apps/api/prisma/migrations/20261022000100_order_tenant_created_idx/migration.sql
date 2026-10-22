-- Hot path EXPLAIN (docs/overnight/EXPLAIN.md, BACKLOG #20): GET /v1/admin/orders (and ⌘K search) read
-- `WHERE "tenantId" = $1 ORDER BY "createdAt" DESC LIMIT n`. No index served it, so every call scanned and
-- sorted all of the tenant's orders (5,000 orders: 12 ms). One statement per file so CONCURRENTLY runs
-- outside a transaction block and never blocks writes to "Order". Reversible: DROP INDEX.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_tenantId_createdAt_idx" ON "Order"("tenantId", "createdAt");
