-- The partial Visit_one_shop_per_day index supersedes this legacy constraint.
-- Dropping it lets a cancelled assignment remain as history while the same
-- shop is placed back on a route for that business date.
DROP INDEX CONCURRENTLY IF EXISTS "Visit_tenantId_agentId_shopId_plannedDate_key";
