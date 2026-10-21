-- Review m6: logout-all, family revocation, deactivation and the device lookup filter RefreshToken by "userId".
-- Own file so CONCURRENTLY runs outside a transaction (no write lock). Reversible: DROP INDEX.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
