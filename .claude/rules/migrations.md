---
paths:
  - "apps/api/prisma/migrations/**"
  - "apps/api/prisma/schema.prisma"
---
# Migrations — prohibitions (owner: docs/brain/clusters/platform-webhooks.md)

Use the `write-migration` skill for any schema change. Have `migration-reviewer` review it.

- **Forward-only.** Never edit, rename or delete a migration folder that is committed. Committed means applied: Vercel runs `prisma migrate deploy` on every build of `main` (`apps/api/scripts/migrate-on-vercel.cjs`). The `guard-write` hook blocks these edits. A fix is a new migration.
- Never touch `migration_lock.toml`. Never run `prisma db push`, `prisma migrate reset` or `--force-reset` (the `guard-bash` hook blocks them). They skip or destroy migration history.
- Create a migration with `pnpm --filter @jewelroute/api exec prisma migrate dev --create-only --name <slug>` against the local DB. Read the generated SQL before applying it.
- **Invariants live in SQL, not only in app code.** A new rule about uniqueness, custody, money or immutability ships as a partial unique index, CHECK, FK or trigger in the same migration, with a test in `apps/api/test/api.test.ts` that hits the constraint.
- Never drop or weaken the existing guards at the end of `20261021000000_init/migration.sql`: `Visit_one_open_per_agent`, `MemoItem_one_out_per_piece`, `SamplePiece_custodian_consistent`, `SamplePiece_weights`, the value CHECKs, and the `jr_forbid_mutation` triggers on `GoldRate`, `CustodyEvent`, `OrderItem`.
- Never add `UPDATE` paths to append-only tables. `jewelroute.allow_purge` permits DELETE only, and only for the demo seed wiping a tenant.
- Money columns are `BIGINT` paise, weight columns `INTEGER` mg. Never `REAL`, `DOUBLE PRECISION`, `NUMERIC` with a fraction, or `MONEY`.
- Every new table has `"tenantId" TEXT NOT NULL` and leads its lookup indexes with it.
- Destructive change = expand → migrate data → contract, across separate migrations and deploys: add the nullable column, backfill, switch code, then add `NOT NULL` or drop in a later migration.
- Big tables: `CREATE INDEX CONCURRENTLY` goes in its own migration file (Prisma wraps a file in a transaction otherwise). Add constraints as `NOT VALID`, then `VALIDATE CONSTRAINT` separately.
- `schema.prisma` and the SQL must agree. After editing the schema, run `pnpm --filter @jewelroute/api exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_URL"`. It must report no difference except the hand-written invariants.
