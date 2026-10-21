# Backend / data-flow audit — 2026-10-21

Scope: `apps/api` (NestJS + Prisma + Postgres), the contract in `docs/CONTRACT.md`, the brief's STEP 1 (audit) and STEP 5 (end-to-end + failure scenarios).
Method: read every module, map each write to the related state it must keep in sync, then prove each finding with a test on real Postgres (`jewelroute_test`).

Evidence: `pnpm --filter @jewelroute/api test` → 25 tests, 0 failures (`test/api.test.ts` 10, `test/failures.test.ts` 15). `pnpm --filter @jewelroute/api e2e` against the local API → 28/28 brief steps with sample AJ-S-000123, re-runnable.

Severity: **high** = wrong money/custody/tenancy or a user can get stuck; **medium** = surfaces disagree or a retry can duplicate; **low** = hardening / wrong status code.

| # | Area | Finding | Severity | Fix | Test |
|---|---|---|---|---|---|
| 1 | Idempotency | `POST /orders`, `/memos`, `/memos/:id/return`, `/memos/:id/convert` silently ran without `Idempotency-Key` (a fresh ULID was used), so a naive client retry after a timeout created a second order/memo. | high | Key is now required on these four creates → `400 IDEMPOTENCY_KEY_REQUIRED` (`IdempotencyService.require`). Web already sends one per action. | F5, F7, F14 |
| 2 | Data flow (custody ↔ visit) | Memo return/convert stamped the custody event with the memo's **original** visit, so a return made during a later visit showed up on the wrong visit record and that visit's outcome missed it. Converted orders had no `visitId`. | medium | Return/convert resolve the caller's open visit at the memo's shop (or an explicit `visitId`, which must be open, own, same shop → else `409 VISIT_SHOP_MISMATCH`). Custody event, outbox payload and the converted order carry it. | F14 |
| 3 | Webhooks | Memo conversion changed memo status (→ `CONVERTED_TO_ORDER`/`RETURNED`) with no memo event — subscribers could not see it. | medium | New event type `memo.converted` (shared `WEBHOOK_EVENT_TYPES`, description, example, feed title) emitted in the same transaction. | F14 |
| 4 | Field flow (stuck agent) | A visit left CHECKED_IN/ACTIVE on an earlier day blocks every check-in (`ANOTHER_VISIT_OPEN`), but `/field/today` only lists today's visits, so the agent could not see what to close. | high | `/field/today` adds `openVisit` (any date) and points `nextVisitId` at it. | F15 |
| 5 | Refresh mid-visit | `GET /visits/:id` did not say where the agent was in the flow; the client had to re-derive it (and could not know about blockers). | medium | Adds `resume { checkedIn, proofUploaded, canCheckIn, canSell, canComplete, nextStep, blockedBy?, pendingAcks[] }`, derived server-side. There are no server-side drafts (orders/memos are written atomically on submit). | F2, F4, F5, F9, e2e 5/10/28 |
| 6 | GPS | Missing `accuracyM` defaulted to `0` → treated as a perfect fix and recorded `VERIFIED`. | medium | Accuracy is optional: unknown accuracy earns no slack and a pass is `LOW_ACCURACY`; stored as `null`. Slack cap (50 m) unchanged. | F3 |
| 7 | Visit states | Nothing ever moved a past `PLANNED` visit to `MISSED`; only the seed produced `MISSED`, so lists/filters and the dashboard disagreed (dashboard inferred it). | medium | Dispatcher sweep (≤1/min + cron) persists `MISSED` for PLANNED visits before today (IST). | F15 |
| 8 | Invalid dates | Admin could assign a visit for a past date (instantly un-check-in-able) or to a deactivated agent. | low | `400 INVALID_DATE` for dates before today; `409 AGENT_INACTIVE`. Assignment accepts `plannedTime` (`HH:MM`, CHECK in SQL). | F2 |
| 9 | Invalid dates | Memo extension could move an overdue memo's due date to another past date. | low | New due date must be ≥ today → `400 INVALID_DUE_DATE`. | F13 |
| 10 | Money | Memo exposure used `valueOrZero`: a purity without a gold rate produced a ₹0 memo instead of an error. | medium | Memo valuation uses `price()` → `409 GOLD_RATE_MISSING` (same as orders). | (code path; covered by memo tests on rated purities) |
| 11 | Tenancy | `POST /admin/pieces/return-to-vault` with another tenant's piece id answered `409 PIECE_NOT_WITH_AGENT` (inconsistent with the 404 rule). | low | Unknown/foreign ids → `404`. | F1 |
| 12 | Tenancy | `CustodyService.label` looked users/shops up by id without `tenantId`. Ids were already validated, but the rule is "every query filters by tenant". | low | `findFirst({ id, tenantId })`. | F1 (indirect) |
| 13 | Agent scope | `GET /v1/files/:id` let any agent of the tenant open any other agent's proof photo. | medium | Non-admins may only fetch files under their own visits' object keys → else `404`. | F1 (cross-tenant), code path for agents |
| 14 | Webhooks | Deliveries to a deactivated endpoint kept making failing "attempts" until DEAD (noise in the log and attempt counts). | low | Parked as `DEAD` ("Endpoint is disabled") without an HTTP attempt; manual retry still works. | F12 |
| 15 | Validation | Invalid enum query params (`/admin/visits?status=`, `/admin/pieces?custodianType=`, `/admin/webhooks/deliveries?status=`) reached Prisma → `500`. | low | zod / explicit checks → `400 VALIDATION_FAILED`. | F12 |
| 16 | Orders | Ordering a design deactivated mid-visit answered `404 Design not found`. | low | `409 DESIGN_INACTIVE` with the SKUs. | F6 |
| 17 | Audit trail | Order creation wrote no audit row, so the order record's history started at approval. | low | `order.create` audit row (number, totals, snapshot). | F11 |
| 18 | Validation | `POST /visits/:id/complete` accepted any lat/lng numbers. | low | Range-checked like check-in. | — |
| 19 | Contract drift | v2 list endpoints (`/admin/visits`, `/admin/shops`, `/admin/pieces`, `/admin/memos`, `/admin/orders`) existed in v1 with narrower shapes in three different controllers. | — | One `RecordsController` serves v1 + v2 as strict supersets (v1 fields kept, e.g. `ShopRow.piecesHere`). | e2e, F1 |

## Verified correct (no change needed)
- **Double check-in** (concurrent and sequential): row lock + partial unique index → exactly one `CHECKED_IN`, one `visit.checked_in` event (tests 1, 1b, F4).
- **Double approve / approve+reject race**: guarded `updateMany … WHERE status='SUBMITTED'` → one decision, one audit row (test 9).
- **Return twice / concurrent returns**: memo row `FOR UPDATE`, items must be `OUT` → `409 PIECE_NOT_ON_MEMO` (test 5, F14).
- **Memo + issue/return-to-vault of the same piece concurrently**: `CustodyService.move` locks pieces `FOR UPDATE ORDER BY id` and verifies the expected custodian → exactly one wins, ledger gap-free (F10).
- **Double assignment of a sample**: issue requires `VAULT` → `409 PIECE_NOT_IN_VAULT` for a held/on-memo piece; concurrent issue of one vault piece to two agents → one wins (F10).
- **Rate change mid-order**: rates are read once per transaction (`RatesService.current(tid, tx)`, one `DISTINCT ON` statement) and every line + `goldRateSnapshot` use that map; OrderItem is append-only (test 8, F11).
- **Error mid-submit then retry with the same key**: the key row is inserted inside the business transaction, so an error rolls it back and the retry re-executes (F6).
- **Webhook pipeline**: outbox row in the same transaction for every event type; fan-out, signed delivery, backoff ladder 30s…6h, DEAD after 7, manual retry (test 7, F12); `memo.overdue` exactly once per overdue period and re-armed by extension (F13).
- **Tenant isolation**: a second tenant built entirely through the API; tenant A gets 404 on every v1/v2 read and write of B's ids, lists/search/home never contain them (F1).

## Known gaps (not fixed, by decision)
- Access JWTs stay valid up to 15 min after an agent is deactivated (refresh tokens are revoked immediately).
- Webhook URLs are not checked against private/loopback ranges in production (https is required). Add an egress allowlist before onboarding customer endpoints.
- `GET /visits/:id` `shopContext` shows other agents' orders/memos at the same shop to an agent (intentional shop context; revisit if agents must be siloed).
- Blob-mode proofs are trusted by URL⇄pathname match (no server re-hash) — unchanged from DECISIONS.md.
