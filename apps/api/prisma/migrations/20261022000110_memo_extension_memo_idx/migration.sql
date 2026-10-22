-- Hot path EXPLAIN (docs/overnight/EXPLAIN.md, BACKLOG #20): every memo view (Home, memo lists and records)
-- loads its extensions with `WHERE "memoId" IN (…)`. "MemoExtension" had only its primary key, so each call
-- read the whole table — every tenant's extensions — and the scan survives `enable_seqscan = off`.
-- One statement per file (CONCURRENTLY, no write lock). Reversible: DROP INDEX.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MemoExtension_memoId_idx" ON "MemoExtension"("memoId");
