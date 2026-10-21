---
name: write-migration
description: Use when a JewelRoute change needs a schema change — new table, column, index, constraint, trigger, enum value — in apps/api/prisma. Produces a new forward-only Prisma migration with the invariants in SQL, applied and tested on local Postgres only. Not for editing an existing migration (never allowed) or for data fixes on hosted databases.
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# write-migration — forward-only, invariants in SQL, local DB only

## Done when
- A new folder `apps/api/prisma/migrations/<YYYYMMDDHHMMSS>_<slug>/migration.sql` exists. No committed migration was touched (guard-write enforces this).
- `schema.prisma` matches the SQL (Prisma-expressible parts), and the hand-written guards (partial unique, CHECK, trigger) sit at the end of the new file under a comment banner, as in the init migration.
- `pnpm --filter @jewelroute/api exec prisma migrate deploy` applied it cleanly to the local DB. `pnpm --filter @jewelroute/api test` passes (the harness applies migrations to `jewelroute_test`), including a test that **hits the new constraint**.
- `migration-reviewer` returned APPROVE (lock risk, expand/contract order, constraints present).

## Gotchas
- **Hosted DBs are off limits.** Neon is unreachable from here (L0002) and guard-bash blocks non-local hosts. Vercel applies migrations at build time on deploy. Everything you run targets `127.0.0.1`.
- `prisma migrate dev` without `--create-only` can prompt to **reset** the dev DB on drift. Always `--create-only`, read the SQL, then `migrate deploy`. `prisma db push` and `migrate reset` are blocked.
- Prisma wraps each migration file in a transaction. `CREATE INDEX CONCURRENTLY` cannot run inside one, so put it alone in its own migration file.
- **Expand → migrate → contract.** Never rename or drop a column in the same deploy as the code that stops using it. Add a nullable column, backfill, switch code, then (in a later migration) `SET NOT NULL` or drop.
- `ALTER TABLE … ADD CONSTRAINT … CHECK` scans the table under lock. For big tables, use `NOT VALID` first, then `VALIDATE CONSTRAINT` in a second migration.
- Enum values: `ALTER TYPE … ADD VALUE` cannot be used in the same transaction that added it. Keep it in its own migration if later statements use the value.
- Append-only tables (`GoldRate`, `CustodyEvent`, `OrderItem`) have `jr_forbid_mutation` triggers. A backfill that UPDATEs them is impossible by design. Add a new column with a default, or a new table.
- Units: money `BIGINT` paise, weight `INTEGER` mg, every table `"tenantId" TEXT NOT NULL` with tenant-first indexes. Quote identifiers (`"SamplePiece"`); Prisma uses PascalCase table names.
- Concurrent agents may be adding migrations too (`ls apps/api/prisma/migrations`). Use a timestamp later than the newest folder, and re-check before committing.

## Steps
1. Read `.claude/rules/migrations.md`, the tail of `20261021000000_init/migration.sql` (line 687 on) and the newest migration folders.
2. Edit `apps/api/prisma/schema.prisma` (models, fields, `@@unique`, `@@index`).
3. Generate without applying:
   `pnpm --filter @jewelroute/api exec prisma migrate dev --create-only --name <slug>`
4. Open the generated `migration.sql`. Check every statement for locks, defaults and NOT NULL on existing rows. Append the hand-written guards under:
   ```sql
   -- =====================================================================
   -- Hand-written invariants (Prisma cannot express these).
   -- =====================================================================
   CREATE UNIQUE INDEX "X_one_open_per_y" ON "X" ("tenantId", "yId") WHERE "status" = 'OPEN';
   ALTER TABLE "X" ADD CONSTRAINT "X_amount_nonneg" CHECK ("amountPaise" >= 0);
   ```
5. Apply locally: `pnpm --filter @jewelroute/api exec prisma migrate deploy` (uses `apps/api/.env`, which points to 127.0.0.1), then `prisma generate`.
6. Write the constraint test (`tdd` skill), e.g. two concurrent inserts → exactly one wins, or a direct `db.$executeRaw` UPDATE on an append-only row → rejected.
7. Run `pnpm --filter @jewelroute/api typecheck && pnpm --filter @jewelroute/api test`.
8. Spawn `migration-reviewer` with the folder name. Address its findings.
9. Commit the migration folder and `schema.prisma` together with the code and test that use them. Mention the expand/contract step in the message.

## Related
- Rules: `.claude/rules/migrations.md`. Review: `migration-reviewer`. Tests: `tdd`.
