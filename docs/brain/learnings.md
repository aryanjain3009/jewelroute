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

