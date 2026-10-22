# Learnings (append-only; supersede, never delete — protocol in README.md)

## L0001 · Schibsted Grotesk's tabular figures look like typewriter digits
- status: confirmed · 2026-10-20 · cluster: web
- evidence: commit 652ad68; `apps/web/src/app/globals.css` `.num, td, [data-num] { font-variant-numeric: lining-nums proportional-nums; font-feature-settings: "tnum" 0; }`
- rule: no `tabular-nums` / `"tnum" 1` anywhere in apps/web. Use `.num` (lining, proportional) and right-align numeric columns. The UI font moved to Inter in 318bd83, but the rule stands until a learning measures Inter's tnum set and supersedes this one.

## L0002 · Neon Postgres is unreachable on 5432 from the dev sandbox
- status: confirmed · 2026-10-20 · cluster: platform-webhooks
- evidence: commit 8352643; `docs/DECISIONS.md` "Migrations + seed on Vercel (no 5432 egress from the dev workspace)"; `apps/api/scripts/migrate-on-vercel.cjs`
- rule: never try to migrate or psql the hosted DB from here (guard-bash blocks non-local DB hosts). Migrations run at Vercel build (`VERCEL=1` → `prisma migrate deploy` via `DATABASE_URL_DIRECT`). Seed the hosted DB with `POST /v1/internal/seed` (CRON_SECRET). Locally, use the local Postgres 16.

## L0003 · pnpm + Prisma on Vercel: bundle the engine through a generated output folder
- status: confirmed · 2026-10-20 · cluster: platform-webhooks
- evidence: `apps/api/prisma/schema.prisma` generator `output = "../generated/prisma"`, `binaryTargets = ["native", "rhel-openssl-3.0.x"]`; `apps/api/vercel.json` `includeFiles: "{dist/**,generated/prisma/**}"`; `docs/DECISIONS.md` "avoids the pnpm-symlink 'engine not found' failure on Vercel"
- rule: import the client from `generated/prisma` (relative), never `@prisma/client`. Keep both binary targets. Never move the output folder without updating `includeFiles`.

## L0004 · The webhook retry ladder needs 7 attempts to use its last delay
- status: confirmed · 2026-10-21 · cluster: platform-webhooks
- evidence: `docs/API_ISSUES.md` #1; commit 5370c8e; `apps/api/test/api.test.ts` test 7 ("1 + 6 retries")
- rule: N backoff delays need N+1 attempts. The ladder is 30s, 2m, 10m, 30m, 2h, 6h → 7 attempts, then DEAD. A change to `BACKOFF_SECONDS` updates test 7, `docs/CONTRACT.md` and the `/developers` copy together.

## L0005 · `createdBy` and other `Ref` fields are objects; rendering them crashes React
- status: confirmed · 2026-10-20 · cluster: web
- evidence: commit 83d0ef4; `docs/API_ISSUES.md` #2 ("Objects are not valid as a React child")
- rule: contract `Ref = {id,name}`. Type it as `Ref` in `src/lib/types.ts` and render `.name`. Check the contract, not a guess, when you mirror a field.

## L0006 · Idempotent replays are deep-equal, not byte-equal
- status: confirmed · 2026-10-20 · cluster: platform-webhooks
- evidence: `docs/DECISIONS.md` › Idempotency "Replays are deep-equal (jsonb may reorder keys)"; `apps/api/src/core/idempotency.ts`
- rule: tests compare replayed responses with `deepStrictEqual`, never string equality. Never hash a stored response to detect a replay.

## L0007 · Playwright MCP 0.0.83 has no `testing` capability
- status: confirmed · 2026-10-21 · cluster: harness
- evidence: `npm view @playwright/mcp@0.0.83 readme` → "--caps … possible values: vision, pdf, devtools"
- rule: `.mcp.json` runs `--headless --isolated --allowed-origins http://localhost:3000` with no `--caps=testing` (the Tijori register's snapshot is outdated). Requests to other origins are blocked (the flag is not a security boundary), so OpenFreeMap tiles do not render in MCP screenshots. Judge the map chrome, not the tiles.

## L0008 · With a root CLAUDE.md, nested AGENTS.md files are not auto-loaded
- status: confirmed · 2026-10-21 · cluster: harness
- evidence: https://code.claude.com/docs/en/memory › "When Claude Code reads AGENTS.md": by default Claude reads AGENTS.md only when there is no CLAUDE.md in the working directory or above
- rule: the path rules `.claude/rules/api.md` and `.claude/rules/web.md` tell the agent to read `apps/*/AGENTS.md`. Never rely on the nested file alone for a prohibition. Put the prohibition in a path rule.

## L0009 · `/verify` is a bundled Claude Code skill; ours replaces it on purpose
- status: confirmed · 2026-10-21 · cluster: harness
- evidence: https://code.claude.com/docs/en/skills (bundled list includes `/verify`; "Your skill replaces the bundled command, but not its aliases")
- rule: keep the project `verify` skill named `verify` (it is a stage of the feature loop). Never name another skill after a bundled one (`code-review`, `debug`, `run`, `batch`, `loop`, `simplify`, `doctor`).

## L0010 · The invariant SQL is at the end of the init migration, not where the schema comment says
- status: confirmed · 2026-10-21 · cluster: platform-webhooks
- evidence: `apps/api/prisma/schema.prisma` lines 3–4 point at `migrations/0001_init/invariants.sql` and `docs/DOMAIN.md` (neither exists); the guards are in `apps/api/prisma/migrations/20261021000000_init/migration.sql` from line 687
- rule: cite the migration file and the constraint name. The stale schema comment needs fixing by the API owner.

## L0011 · postgres-mcp 0.3.0 does not install as published; it needs two uv overrides
- status: confirmed · 2026-10-21 · cluster: harness
- evidence: `uvx postgres-mcp@0.3.0` → "there is no version of pglast==7.2.0"; with `pglast==7.21` → "No module named 'mcp.server.fastmcp'. This is mcp 2.x". With both overrides, `initialize` + `tools/list` succeed, `execute_sql "DELETE …"` → "Error validating query" (restricted mode), `select count(*)` works
- rule: start it only through `scripts/mcp/postgres.sh` (passes `--overrides scripts/mcp/postgres-mcp.overrides.txt`). Re-test the overrides before bumping the version.

## L0012 · Playwright MCP 0.0.83 needs its own browser build
- status: confirmed · 2026-10-21 · cluster: harness
- evidence: `browser_navigate` → "Browser \"chrome-for-testing\" is not installed; expected executable at /opt/pw-browsers/chromium-1247/…". With `PLAYWRIGHT_MCP_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `http://localhost:3000/login` loads ("Sign in · JewelRoute") and `https://example.com/` → `net::ERR_BLOCKED_BY_CLIENT`
- rule: first use on a machine is `npx -y @playwright/mcp@0.0.83 install-browser chrome-for-testing`, or export `PLAYWRIGHT_MCP_EXECUTABLE_PATH` to an installed Chromium. Never put a machine path in `.mcp.json`.

## L0013 · A business rule the UI enforces must also be enforced by the API
- status: confirmed · 2026-10-21 · cluster: field
- evidence: VERIFY-REPORT M1 — with only `sale-view.tsx` checking proofs, `POST /v1/memos` on a checked-in, proofless visit → 201 and custody moved; after `VisitsService.requireProof` → `409 PROOF_REQUIRED_BEFORE_SALE` (`apps/api/test/api.test.ts` 1c, `failures.test.ts` F14)
- rule: put the guard in the service inside the write transaction, derive `resume.*` flags from the same predicate, and have the UI read `resume` instead of re-deriving it.

## L0014 · After a 5xx on a create, re-send the same Idempotency-Key before saying anything about the outcome
- status: confirmed · 2026-10-21 · cluster: custody-memo
- evidence: VERIFY-REPORT M2 — commit-then-500 made the memo UI say "Custody didn't change"; with `sendConfirmed` (`apps/web/src/components/field/guard.ts`) the replay returns the committed memo + ack and the UI lands on the QR with exactly 1 memo (`fixcheck/m2-memo.js`)
- rule: a network error, 5xx or `IDEMPOTENCY_IN_PROGRESS` is "unknown", not "failed": keep the draft and key, re-send, and only a 2xx or a 4xx is a definite answer.


## L0015 · zod 4 keeps `.default()` through `.partial()` — PATCH schemas silently reset fields
- status: confirmed · 2026-10-21 · cluster: platform-webhooks
- evidence: `z.object({a: z.number().default(0)}).partial().parse({})` → `{a: 0}`; `PATCH /admin/shops {ownerName}` reset `creditLimitPaise` to 0 (credit rule off), city and geofence; `PATCH /admin/designs` wiped stone value/images. Fixed with default-free field sets; `test/v3.test.ts` V5
- rule: never derive a PATCH schema with `.partial()` from a create schema that has defaults. Build both from one default-free `Fields` object; only the create schema adds `.default()`.

## L0016 · A per-shop money rule needs the shop row lock, and the visit lock does not give it
- status: confirmed · 2026-10-21 · cluster: orders-pricing
- evidence: `test/v3.test.ts` V2 — two agents with open visits at one shop, 4 concurrent orders, room for one: with `lock:false` → 2 CONFIRMED (red); with `SELECT … FROM "Shop" … FOR UPDATE` before the sums → exactly 1 CONFIRMED (green). Orders on the same visit were already serialised by the visit lock, which hid the race
- rule: evaluate exposure only after locking the shop row in the same transaction (`CreditService.position(…, {tx, lock:true})`), and take the same lock in every write that changes exposure (approve, settle, cancel, shop PATCH). Test with two different visits.

## L0017 · A forced dispatcher sweep was dropped when a post-commit run was in flight
- status: confirmed · 2026-10-21 · cluster: platform-webhooks
- evidence: `test/v3.test.ts` V6 — `POST /v1/internal/dispatch` right after a write returned the in-flight run, whose rerun had `forceOverdue:false`, so `memo.overdue` was not emitted for up to 60 s. Fix: `Dispatcher.forceNext` carries the force into the rerun
- rule: when a call joins an in-flight run, carry its options into the rerun instead of discarding them.

## L0018 · Dropping an enum value with the code switch breaks every read of the old build, not just its writes
- status: confirmed · 2026-10-21 · cluster: platform-webhooks · decided by the lead (B2)
- evidence: T3 review R8 — the pre-v3 Prisma client against the migrated DB: `findMany` → `Value 'CONFIRMED' not found in enum 'OrderStatus'`; create → 22P02. Fixed forward: `20261021000400` re-adds SUBMITTED, `…0500/0600` CHECK `Order_no_submitted`; rollback script tested in `test/v3.test.ts` V11
- rule: changing an enum's value set is expand → migrate → contract. Add values first, guard old ones with a CHECK, drop them in a later release. Ship a tested down script with any one-way change.

## L0019 · A status transition that ends a sale must undo the custody it caused, and SQL must refuse it otherwise
- status: confirmed · 2026-10-21 · cluster: custody-memo · decided by the lead (B1)
- evidence: review P1 — reject of a converted order left the piece SOLD, no receivable, memo return 409. Now reject un-sells (`OrdersService.unsell`, reason SALE_REJECTED); deferred constraint triggers `SamplePiece_sold_has_live_order`/`Order_dead_unsells_pieces` make the bad state uncommittable (`test/v3.test.ts` V10: red → 500 without the un-sell, green with it)
- rule: for every exit from a state that moved custody (reject, cancel, delete), either reverse the move through `CustodyService.move` in the same transaction or refuse the exit; back it with a commit-time SQL guard.

## L0020 · Back-fills go in batched scripts that reuse the app's derivation, not in the migration
- status: confirmed · 2026-10-21 · cluster: platform-webhooks · decided by the lead (M1)
- evidence: review R9 — `20261021000300` held ACCESS EXCLUSIVE on Order/OutboxEvent for 110 s at 40k orders/300k events. `backfillActivityRefs` (1k rows/tx, keyset, `eventRefs()`) is idempotent (`test/v3.test.ts` V12) and runs after migrate (Vercel build, run-local.sh)
- rule: migrations add columns/values/NOT VALID checks; data moves in a script that is safe to re-run and shares code with the live write path.

## L0021 · Two paths that lock the same rows in opposite order deadlock under normal use — keep one global order
- status: confirmed · 2026-10-21 · cluster: orders-pricing · re-review N1
- evidence: reject (Shop → Memo) ‖ convert (Memo → Shop) on one memo → `409 CONCURRENT_UPDATE` in round 0 of `test/v3.test.ts` V13 (reviewer: 11/12); after `lockConversion` (Memo → Pieces before Shop) V13 passes 6/6 rounds, 4 full-file runs
- rule: Memo → Visit → SamplePiece (id order) → Shop → Order. A new path that locks two of these follows it, and gets a reject‖convert-style concurrency test.


## L0022 · Raw SQL time comparisons assume a UTC session — pin it, and assert it
- status: confirmed · 2026-10-22 · cluster: platform-webhooks · overnight lead
- evidence: on a Homebrew Postgres in Asia/Kolkata, tests 7, A11, F12 failed (webhook retry fired at once); `TIMESTAMP(3)` columns hold UTC while `now()` and Date params (`timestamptz`) are read in the session zone. Migration `20261022000000_session_timezone_utc` + test 7a; migration-reviewer APPROVE.
- rule: in raw SQL take `(now() AT TIME ZONE 'UTC')`, never a bare `now()` (test 7a scans src); never compare a timestamp column with a Date param. The database default is UTC as the second line, and the API logs an error at boot otherwise. Done in f33c573: with the DB forced back to IST the api/audit/failures/v3 suites pass (63/64, only 7a's UTC assertion fails).

## L0023 · An email signs in to one workspace — every user-creating path takes `lockEmail`
- status: confirmed · 2026-10-22 · cluster: platform-webhooks · overnight lead (security review APPROVE with M1/M2)
- evidence: the sign-in form is email + password with no workspace field (the API accepts an optional `tenantSlug` that the web never sends; `take: 2` → refuse when ambiguous). `User` is unique per `(tenantId, email)` only, so the global rule lives in `lockEmail` + check (signup, agent create); `tenancy.test.ts` S2, S3 (10 parallel signups → 1 workspace).
- rule: a new path that creates a user calls `lockEmail(tx, email)` and checks the email globally. Before signup is public: email verification and a shared rate-limit store (review M1, M2: email squatting and an EMAIL_TAKEN existence oracle on signup and agent create), or drop the global rule and make login ask for the workspace. Known deviation from INV-5: signup takes no Idempotency-Key — a retry after a lost 201 gets 409 EMAIL_TAKEN (one effect; the owner signs in). Open human decision: a unique index on lower(email) to move the rule into SQL.

## L0024 · Route uniqueness is a shop/day rule, not an agent/day query
- status: confirmed · 2026-10-22 · cluster: field
- evidence: `apps/api/test/api.test.ts` test 0: two concurrent agents assigning one shop/date produced `[201,201]` before `Visit_one_shop_per_day`, then `[201,409]`; cancellation followed by reassignment returns 201. Full API suite: 101/101.
- rule: load the whole business day when checking assignment availability and enforce `(tenantId, shopId, plannedDate)` for non-cancelled visits in SQL. A cancellation preserves history but releases the slot. This supersedes only L0016's advice to create two same-shop visits in concurrency tests; its shop-row-lock rule remains.
