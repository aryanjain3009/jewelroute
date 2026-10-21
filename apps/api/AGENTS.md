# apps/api — conventions that differ from the root

- NestJS 11 on Express 5, compiled with plain `tsc` (`tsconfig.build.json` → `dist/`). `api/index.ts` (Vercel) only `require`s `dist/serverless`; `src/main.ts` listens locally on :4000.
- Prisma client is generated to `apps/api/generated/prisma`. Import types from `'../../generated/prisma'` (relative), never from `@prisma/client` — the pnpm + Vercel bundling depends on it (`docs/brain/learnings.md` L0003).
- Validate every body/query with zod 4 through `parse()` in `src/common/http.ts` (→ `400 VALIDATION_FAILED`). Throw only the helpers in `src/common/errors.ts` (`conflict`, `notFound`, `unprocessable`, …) with a stable `CODE`; the envelope filter and interceptor format the response.
- Every write runs in one transaction: `this.idem.run(ctx, (tx, clientOpId) => …)` for creates that take an `Idempotency-Key`, otherwise `this.prisma.tx(tx => …)`. Pass `tx` down; never mix `this.prisma.db` reads into a write path that needs a consistent view.
- Custody changes only through `CustodyService.move(tx, ctx, …)`. Outbox events only through `OutboxService.emit(tx, …)`. Audit rows only through `AuditService.log(tx, …)`. The demo seed (`src/seed/seed.ts`) and piece intake (`seq 1`, `INTAKE`) are the only other custody writers.
- Raw SQL uses the tagged template `tx.$queryRaw\`…${value}…\``. Never `$queryRawUnsafe` / `$executeRawUnsafe` with interpolated input.
- `tenantId` comes from `ctx.user.tid` and appears in every `where`. Look up foreign ids with `findFirst({ where: { id, tenantId } })` and answer 404 when missing.
- BigInt columns leave the API as JSON numbers (`installBigIntJson`). Convert with `Number()` only at the response edge.
- Business dates are IST (`istDate` from `@jewelroute/shared`), stored as `@db.Date` at UTC midnight.
- A new or changed route updates `docs/CONTRACT.md` (Changelog entry with the date) in the same change.
- Tests: `test/api.test.ts` with `test/harness.ts` — they migrate and seed the test DB, boot `dist/main.js` on :4107 and call HTTP. Add a numbered test per invariant; assert DB rows (`db.…`) as well as HTTP status. Tests run serially (`--test-concurrency=1`). `pnpm --filter @jewelroute/api test` rebuilds `dist` first.
- Schema comments mention `migrations/0001_init/invariants.sql` and `docs/DOMAIN.md`; neither exists. The invariants are at the end of `prisma/migrations/20261021000000_init/migration.sql`.
