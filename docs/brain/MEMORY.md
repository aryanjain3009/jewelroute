# MEMORY — JewelRoute current state (≤60 lines; protocol: docs/brain/README.md)

## Stage (2026-10-21)
MVP live on Vercel (api + web projects, hosted Neon Postgres). v1 API complete with tests 1–9.
**v2 Attio-style IA in progress:** the API agent is adding the `docs/CONTRACT.md` v2 endpoints (`modules/records.ts`, migration `20261021000200_v2_attio_ia`). The web agent is rebuilding the admin and field chrome per `docs/DESIGN.md` v2 (Inter, sidebar shell, DataTable, record pages, ⌘K).
**v3 implemented (API, 2026-10-21):** credit-aware orders (CONFIRMED / PENDING_APPROVAL by rule), settle/cancel, tenant threshold, one activity model (OutboxEvent refs + `ActivityService`). Migrations `…0300_v3_credit_activity` + follow-ups `…0400/0500/0600` (T3 review REJECT → lead decisions B1 reject un-sells memo conversions, B2 SUBMITTED kept for rollback + down script, M1 batched refs back-fill; docs/brain/reviews/2026-10-21-v3-credit-activity.md); tests `apps/api/test/v3.test.ts` V1–V12.
Harness v1 (lite) installed: AGENTS.md map, path rules, brain, 13 skills, 6 subagents, 5 hooks, `.mcp.json`, `pnpm verify`.

## Clusters (owned paths, invariants, gates)
- custody-memo (T3) → clusters/custody-memo.md · INV-1, INV-2
- orders-pricing (T3) → clusters/orders-pricing.md · INV-4, INV-5, INV-7
- field (T2/T3) → clusters/field.md · INV-3
- platform-webhooks (T3) → clusters/platform-webhooks.md · INV-5, INV-6, INV-8

## Open threads
- Blob-mode proofs are trusted by URL⇄pathname match with no server re-hash (known gap, `docs/DECISIONS.md` › Uploads).
- Rate limits are in memory per instance; a Redis store is the upgrade path.
- Cron dispatch runs daily on the Vercel Hobby plan. Delivery mostly relies on post-commit `waitUntil` and opportunistic reads.
- `schema.prisma` header comment points at files that do not exist (L0010). The API owner should fix it.
- The pricing worked example (clusters/orders-pricing.md) is not yet a test in `pricing.test.ts`.
- Web has no unit tests. UI correctness is checked by `ui-verify` screenshots only.

## Decisions (one line each; full text in docs/DECISIONS.md)
- No Redis/BullMQ: Postgres outbox + `FOR UPDATE SKIP LOCKED` lease; `DispatchQueue` is the seam.
- Invariants in SQL: partial uniques, custodian CHECK, append-only triggers; `jewelroute.allow_purge` is the seed-only DELETE hatch.
- Idempotency row inside the business transaction; `clientOpId` unique on Order and Memo.
- Pricing is server-authoritative via shared `priceDesign` / `orderTotals`; orders freeze rate and components.
- Tenant from JWT only; foreign ids → 404.
- Migrate at Vercel build; seed via `POST /v1/internal/seed`.
- Webhooks: 7 attempts then DEAD, HMAC-SHA256, secrets AES-256-GCM at rest.
- Simulated GPS only in demo tenants, stored as SIMULATED.
- MapLibre + OpenFreeMap (no API key).

## Confirmed learnings index (full entries in learnings.md)
- L0001 no tabular figures in the web UI; `.num` lining-proportional + right-align
- L0002 hosted Neon unreachable on 5432 from the sandbox → migrate at Vercel build
- L0003 Prisma client from `apps/api/generated/prisma` (pnpm + Vercel engine bundling)
- L0004 N backoff delays need N+1 attempts (webhooks: 7)
- L0005 `Ref` fields are `{id,name}` objects; render `.name`
- L0006 idempotent replays are deep-equal, not byte-equal
- L0008 nested AGENTS.md is not auto-loaded next to a root CLAUDE.md → path rules point to it
- L0015 zod 4 `.partial()` keeps `.default()` → build PATCH schemas from default-free fields
- L0016 per-shop money rules lock the shop row; L0024 forbids two active visits at one shop/day
- L0018 enum value sets change by expand/contract, with a tested down script
- L0019 an exit from a state that moved custody reverses it or is refused (SQL commit-time guard)
- L0010 the invariant SQL is at the end of the init migration (line 687+)
