# T3 review: v3 credit-aware orders, receivables and activity (`e40e83f`)

- **Verdict: REJECT.** There are 2 blockers. One needs a human decision, the other needs a code fix with a new migration.
- **Reviewer:** invariant-reviewer and migration-reviewer, run as one T3 review. The default verdict was REJECT until evidence showed otherwise.
- **Scope:** commit `e40e83f`, which includes migration `20261021000300_v3_credit_activity`.
- **Date:** 21 Oct 2026, 5:48 pm IST.
- **Product code:** none was edited. The probes ran on scratch copies and scratch databases only.

## Receipts

| # | Command | Exit | Result |
|---|---|---|---|
| R1 | `pnpm verify` (tree `e40e83f` plus uncommitted web edits by another agent) | 0 | shared 14/14 (credit known answers 1–6), api 41/41 (v3 V1–V9), web typecheck and lint ok, harness 102/102 |
| R2 | `POST /v1/internal/seed` (x-cron-secret), then `tsx scripts/e2e-smoke.ts` against :4000 | 200 / 0 | `E2E PASSED — 31 checks` |
| R3 | Scratch DB `jr_review_v3`: `prisma migrate deploy` with the `e40e83f~1` migrations (3 folders), then the **previous seed** (`git archive e40e83f~1`, old client generated in scratch) | 0 / 0 | Seeded aurum: 6 orders (APPROVED ×3, REJECTED, SUBMITTED ×2), 2 memos, 41 events |
| R4 | Added representative legacy rows in R3. These are boundary SUBMITTED orders at Kapoor (memo exposure), Jain and Royal Gems (APPROVED order), plus a second tenant with limit 0, limit 100 and a DRAFT row. Then `prisma migrate deploy` with the current migrations | 0 | Applied in 1.9 s. Mapping table below |
| R5 | `tsx` script comparing `eventRefs()` with the SQL back-fill on every OutboxEvent in R4 | 0 | 44 rows. 1 mismatch, on a synthetic empty-string id only (m1). All 41 seeded events match and have a ref. All 30 ledger rows: piece is in `pieceIds` |
| R6 | `prisma migrate diff --from-migrations … --to-schema-datamodel … --shadow-database-url <scratch>` | 0 | `-- This is an empty migration.` |
| R7 | Restored the R3/R4 dump with `Shop.creditLimitPaise = -1` on one row, then `prisma migrate deploy` | 1 | P3018 at `Shop_credit_nonneg`. Everything rolled back: enum still `{DRAFT,SUBMITTED,APPROVED,REJECTED}`, no `settledAt` column, row recorded as failed. The file is atomic |
| R8 | Old (`e40e83f~1`) Prisma client run against the migrated DB from R4 | — | `findMany` → `Value 'CONFIRMED' not found in enum 'OrderStatus'`. Create → `22P02 invalid input value for enum "OrderStatus": "SUBMITTED"`. Approve `where SUBMITTED` → same 22P02 |
| R9 | Scale DB: 40,016 orders (10,011 SUBMITTED, 200 shops) and 300,044 events (120 MB), at the previous migration. Then `prisma migrate deploy`, with a plain `SELECT count(*) FROM "Order"` started 3 s in | 0 | Migration took **110 s**. The reader was **blocked for 107 s**. The outbox back-fill alone takes about 31 s. The per-order loop accounts for the rest (about 8.5 ms per iteration, no usable index) |
| R10 | Mutant copy in scratch with the shop `FOR UPDATE` removed, then `node --test --test-name-pattern V2 test/v3.test.ts` | 1 | `not ok … V2` with `CONFIRMED, CONFIRMED`. The test does guard the lock |
| R11 | Scratch probes P1–P3 on real code (scratch DB, port 4199) | 0 | Results under Findings and Checklist |

Legacy mapping after R4. Every row matches a hand-computed expectation.

| Shop (limit, OUT memo, live APPROVED) | Legacy row → status | Snapshot exposure → projected |
|---|---|---|
| Kapoor (300,000,000; 76,852,200; 0) | RV-K1 223,147,800 → CONFIRMED (exactly at the limit) | 76,852,200 → 300,000,000 |
| Kapoor | RV-K2 1 → PENDING_APPROVAL `{CREDIT_LIMIT}` | 300,000,000 → 300,000,001 |
| Royal Gems (180,000,000; 0; 63,742,978) | RV-R1 116,257,022 → CONFIRMED · RV-R2 500 → PENDING · RV-R3 0 → CONFIRMED | 63,742,978 → 180,000,000 · 180,000,000 → 180,000,500 · 180,000,000 → 180,000,000 |
| Jain (150,000,000; REJECTED not counted) | RV-J1 150,000,001 → PENDING `{CREDIT_LIMIT}` | 0 → 150,000,001 |
| Bansal / Sethi (seeded SUBMITTED) | ORD-…35 / …36 → CONFIRMED | 0 → total |
| Tenant 2, limit 0 / limit 100 | O21 999,999,999,999 → CONFIRMED · O31 100 → CONFIRMED · O32 100 → PENDING · O33 DRAFT unchanged | — |
| APPROVED / REJECTED legacy | Status unchanged, `approvalRequired = true`, reasons `{}`, snapshot null | — |

All 5 new CHECKs and `OutboxEvent_pieceIds_not_null` show `convalidated = t`. The mapping is idempotent: once it has run, no SUBMITTED rows remain and the type rejects the value. The APPROVED/REJECTED back-fill is a no-op on v3 rows.

## Findings

### Blocker

**B1. A rejected memo conversion leaves pieces sold, with no receivable and no way back.** Files: `apps/api/src/modules/orders.ts:194-204`, `memos.ts:274-287`.

`cancel` refuses memo-converted orders because their pieces are sold (`orders.ts:287`, `sourceMemoId: null`; DECISIONS v3). `decide()` has no matching guard, so a manager can **reject** the same order. The v3 rule now sends every over-limit conversion to `PENDING_APPROVAL`, so rejecting is the expected manager action.

Repro P1 (R11):
1. Shop with limit 0. Memo 1 piece. PATCH the limit to 1.
2. `POST /memos/:id/convert` → 200, `PENDING_APPROVAL` `['CREDIT_LIMIT']`.
3. `POST /admin/orders/:id/reject` → 200 `REJECTED`.
4. The piece custodian is now `SOLD`, the MemoItem is `CONVERTED`, and the shop credit shows exposure 0, outstanding 0 and memo 0.
5. `POST /memos/:id/return` → `409 PIECE_NOT_ON_MEMO`.

The jewellery is gone from inventory, gone from memo exposure and absent from receivables, and it cannot be recovered. The "converted orders cannot be cancelled" rule also has no SQL guard (checklist item 2).

The hole existed before v3 (SUBMITTED conversions could be rejected), but v3 widens it and contradicts its own decision. Fix it in a new migration plus code, test first:
- Option (a): refuse reject for `sourceMemoId` orders. Approve is then the only way out of pending, or there is an explicit un-sell custody path.
- Option (b): make reject un-sell. Move the pieces SOLD → SHOP and set the MemoItems back to OUT through `CustodyService.move`.

Either way, add a CHECK such as `status NOT IN ('CANCELLED','REJECTED') OR "sourceMemoId" IS NULL` (or whatever the chosen rule needs) and a test that hits it. **Human decision:** which of the two behaviours to use.

**B2. The migration drops `SUBMITTED` in the same change as the code switch.** This is a one-way door with an understated impact and no rollback plan. Files: `migration.sql:24-28,80`, `docs/DECISIONS.md:35`.

`.claude/rules/migrations.md` requires expand → migrate → contract across separate deploys (migration-reviewer checks 6 and 8). This migration recreates the enum without `SUBMITTED` and drops the column default in the same deploy.

DECISIONS.md:35 accepts that "the old deployment cannot create orders … seconds". R8 shows the impact is wider:
- The old client cannot **read any order** (`Value 'CONFIRMED' not found in enum`). Dashboard, Home, orders and shop records all 500 on the still-serving deployment during the build.
- The old client cannot approve.
- A rollback to the previous deployment cannot work without a down migration.

A builder cannot waive this rule. The migration is committed and applied locally, so editing it is not allowed. Required:
- A human signs off the one-way door in `docs/brain` with the real impact (all order reads fail on the old code, so rollback is impossible).
- A written rollback runbook: the down SQL, i.e. recreate the old enum and map CONFIRMED / PENDING_APPROVAL / CANCELLED back to SUBMITTED / REJECTED, with explicit data-loss notes for settledAt and cancellation fields.
- Reversibility notes in the next migration's header.

### Major

**M1. Lock and back-fill cost scale badly, and the whole file runs in one transaction.** File: `migration.sql:17-26, 37-77, 84-105, 111-120`.

From line 17, `OutboxEvent` holds ACCESS EXCLUSIVE, and from line 26, `Order` does too. Both are held until commit. On top of that:
- `Order` is rewritten twice (the type goes to TEXT and back), not once as the header says.
- The DO loop runs 3 queries per SUBMITTED row. They filter on `shopId` without `tenantId`, so no index can be used, and the `(tenantId, shopId, status)` index is only created at line 99. The cost is O(SUBMITTED × orders).
- There is a 300k-row JSON back-fill UPDATE.
- 6 indexes, including a GIN, are created without `CONCURRENTLY`.
- The CHECKs are validated inline, not `NOT VALID` then `VALIDATE`.

R9: 110 s total, and reads on `"Order"` were blocked for 107 s. It is fine at demo scale (R4: 1.9 s). The header's only justification is "small tables". Before any non-demo tenant:
- Split the work: back-fill in batches, indexes `CONCURRENTLY` in their own files, CHECKs `NOT VALID` then `VALIDATE`.
- Make the loop set-based, or index it first.
- Record the size limit in DECISIONS.

### Minor

- **m1. Back-fill and `eventRefs()` disagree on empty-string ids.** `event-refs.ts:18` turns `''` into null; the SQL `#>>` keeps `''`. Repro: event `evt_rv2` with `data.shop.id = ""` gives `shopId` `''` from SQL and `"rv_s2"` (aggregate fallback) from TS (R5). No real payload does this yet.
- **m2. Legacy snapshots lack `shopId` and `asOf`.** The legacy `creditSnapshot` (`migration.sql:60-74`) is missing both. `views.ts:147` returns it as `approval.position`, so its shape differs from the CreditPosition in CONTRACT.md:9.
- **m3. Frozen fields have no SQL guard.** `creditSnapshot`, `approvalReasons` and `approvalRequired` are "frozen at creation", but nothing in SQL enforces it. This matches the `goldRateSnapshot` precedent, but it is a gap under checklist item 6.
- **m4. The piece activity filter does not use the GIN index.** For `?pieceId=`, the planner chooses `OutboxEvent_tenantId_createdAt_idx` and filters 300,002 rows (217 ms, R9 DB). The GIN on `pieceIds` (`migration.sql:105`) is unused. Make it tenant-aware or check the plan.
- **m5. `Number(bigint)` is used before the response edge.** `apps/api/src/core/credit.ts:10` converts in the service layer. It is safe-integer guarded by `paise()` (`packages/shared/src/credit.ts:41`), but it deviates from `.claude/rules/money-custody.md`.
- **m6. Migrated statuses are not audited.** SUBMITTED → CONFIRMED/PENDING rows get no audit row and no `order.confirmed` / `order.pending_approval` event. Order history shows `order.create SUBMITTED` and then nothing, yet the order now counts in outstanding. Consider a `system` audit row per migrated order.
- **m7. V9 does not exercise the real deploy path.** `test/v3.test.ts:445,470` applies migrations with `psql -f`, which autocommits each statement, not with `prisma migrate deploy`. R3, R4 and R7 cover the gap.

## Invariant checklist (invariant-reviewer)

1. **Integer units: PASS.** Paise are integers end to end. `creditPosition` only sums and compares. Known answers are hand-computed literals (`packages/shared/src/credit.test.ts:7-65`). `> limit` is at `credit.ts:58` and `≥ threshold` at `credit.ts:60`, matching CONTRACT.md:9. They are tested at ±1 paisa (shared tests 3–4, V1). See also m5.
2. **Invariants in DB and domain: FAIL (B1).**
   - The shop row is locked `FOR UPDATE` in the create transaction before the sums (`orders.ts:72`, `core/credit.ts:24-26`).
   - Memo convert flips the items first, then calls `createInTx`, which takes the same lock (`memos.ts:277-278`). V2 is red without the lock (R10).
   - Approve, settle, cancel and shop PATCH take the same lock (`orders.ts:200,252,284`, `admin.ts:298`).
   - New CHECKs are present.
   - The "converted orders cannot be cancelled or rejected" rule has no SQL guard, and reject bypasses it.
3. **One failing test per invariant: PASS-WITH-GAP.** V1–V9 assert DB rows. There is no test for reject on a converted order (B1).
4. **Known-answer maths: PASS.**
5. **Choke points: PASS.**
   - Every outbox insert goes through `OutboxService.emit` (`outbox.ts:41`, refs set at `:40`) or the seed `feed()` (`seed.ts:231`, `eventRefs`). Grep finds no other `outboxEvent.create` or `INSERT INTO "OutboxEvent"`.
   - The only order creates are `orders.ts:76` (CONFIRMED or PENDING_APPROVAL) and `seed.ts:314` (computed by the rule). **No path writes SUBMITTED.** The enum lacks it and there is no default (R8, V4).
6. **Snapshots immutable: PASS.** No code updates `creditSnapshot`. See m3.
7. **Failure modes: PASS.**
   - Approve, settle and cancel use `updateMany … WHERE status`, check the row count and report the committed state.
   - Race P2 (approve ×2, cancel and reject at once): exactly one 200, 1 transition event and 1 audit row.
   - 5 concurrent settles: one 200, 1 `order.settled` and 1 audit row.
   - The migration rolls back atomically (R7).
8. **Tenancy: PASS.**
   - `ActivityService.where` always sets `tenantId` (`activity.ts:112`), and label lookups are tenant-scoped (`:148-153`).
   - P3: another tenant's admin gets 0 items for aurum `orderId`, `shopId`, `agentId`, `visitId` and `limit=200`, including with a forged cursor naming an aurum event id. Order and credit return 404. V8 covers the rest.
9. **Secrets/PII: PASS.**
10. **Audit: PASS for live transitions.** `order.create`, `approve`, `reject`, `settle`, `cancel` and `tenant.settings` all write audit rows. See m6 for the migration.

## Migration checklist (migration-reviewer)

1. **Forward-only: PASS.** `git diff --name-status e40e83f~1 e40e83f -- apps/api/prisma/migrations` shows only `A …/20261021000300_v3_credit_activity/migration.sql`. Its timestamp is the latest.
2. **Schema agreement: PASS.** R6 gives an empty diff.
3. **Units and tenancy: PASS.** New money columns are BIGINT. No new tables.
4. **Invariants in SQL: PASS-WITH-GAP.** Six guards are present and hit by V4. Existing guards are untouched. Gap: B1.
5. **Lock risk: FAIL at scale (M1).**
6. **Expand/contract: FAIL (B2).** The enum value and the default are dropped together with the code switch.
7. **Applies cleanly: PASS.** Verified with `prisma migrate deploy` on real previous-seed data plus boundary rows (R3, R4). Statuses and back-filled refs were checked (R4, R5). The new indexes are used for shop, activity and order-exposure queries (R9 EXPLAIN). The piece filter is the exception (m4).
8. **Reversibility: FAIL.** This is a one-way door: old code cannot read migrated rows (R8), and there is no rollback plan (B2).

**Webhook event types are documented.** They appear in CONTRACT.md:224, `packages/shared/src/events.ts:1-27` (`EVENT_DESCRIPTIONS`) and `webhooks.module.ts` EXAMPLES. The e2e step 29 receiver verified the signed deliveries.

## Closing state

- **WILL BREAK:** B1. Rejecting a converted order loses pieces from both inventory and receivables.
- **WILL COST:** M1. Order and outbox are locked for minutes on real volumes.
- **WILL ROT:** m1, m2, m4, m7.
- **OVERALL: FAIL** (invariants). The migration review gives **REQUEST CHANGES**.

**Human decisions needed:**
1. For B1, block reject on converted orders, or make reject un-sell the pieces.
2. For B2, sign off the one-way door, with a rollback runbook.

Scratch databases (`jr_review_*`) were dropped after the review. The local API was reseeded.
