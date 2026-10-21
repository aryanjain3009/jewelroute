# T3 re-review: v3 review fixes (`14a7a60`)

- **Verdict: APPROVE.** B1, B2 and M1 from `2026-10-21-v3-credit-activity.md` are resolved, and I checked each one myself. I found no new blocker. There is one new **major** issue (a lock-order deadlock between reject and convert) that should be fixed next, and six minors.
- **Reviewer:** an independent verifier, invariant-reviewer and migration-reviewer in one pass, run with fresh context. The default verdict was REJECT.
- **Scope:** `e40e83f..14a7a60`. The fix itself is in `14a7a60`; `fd61646` is web-only and was not reviewed. The tree was `14a7a60` and clean.
- **Date:** 21 Oct 2026, 6:15 pm IST. No product file was edited.
- **Scratch work:** scratch DBs `jewelroute_rr`, `jr_rr_rb`, `jr_rr_pre` and `jr_rr_shadow`, plus scratch API instances on :4300 and :4301. All were removed afterwards. I did not touch :3000, :4000 or the `jewelroute` DB, apart from a single read-only SELECT.

## Receipts

| # | Command | Exit | Result |
|---|---|---|---|
| R1 | `pnpm verify` | 0 | shared 14/14, api **44/44** (V10, V11 and V12 are new), web typecheck and lint ok, harness 102/102 |
| R2 | `git diff --stat e40e83f..14a7a60 -- apps/api/prisma/migrations/20261021000300*` | 0 | Empty: 0300 is untouched. `--name-status` on migrations shows only `A` for 0400, 0500 and 0600 |
| R3 | `prisma migrate deploy` (all 7 folders) on the empty scratch DB `jewelroute_rr`, then `POST /v1/internal/seed` against the :4300 instance on that DB | 0 / 200 | — |
| R4 | `BASE_URL=http://localhost:4300 CRON_SECRET=… pnpm e2e` | 0 | `E2E PASSED — 31 checks`. The first attempt, before seeding, exited 1 with a login 401. The coordinator asked that :4000 not be used |
| R5 | `jr_rr_rb`: deploy all, then `psql -v ON_ERROR_STOP=1 -f prisma/rollback/20261021000300_v3_down.sql`, then `prisma migrate diff --from-url jr_rr_rb --to-migrations <git archive e40e83f~1>/migrations` | 0 / 0 | `-- This is an empty migration.` |
| R6 | Catalog dump of constraints (with defs), non-internal triggers, functions, indexes, enum labels and column types/defaults. Compared the rolled-back `jr_rr_rb` with `jr_rr_pre` (the pre-v3 migrations only) | `diff` 0 | 464 identical lines. The down script restores the exact pre-v3 schema, including CHECKs and triggers that Prisma's diff cannot see |
| R7 | Probe (`node --test`, harness on `jewelroute_rr`, :4301): 12× `reject(order A) ‖ convert(piece B)` on the same memo | 0 | **11× `reject 409 CONCURRENT_UPDATE`** and 1× both 200. The PG log shows `deadlock detected`: reject waits on `Memo … FOR UPDATE` while holding Shop, and convert waits on `Shop … FOR UPDATE` while holding Memo. After the probe: 0 orphan SOLD pieces, 0 custodySeq gaps, 0 OUT items not at the shop |
| R8 | Same probe: 8× `reject ‖ memo return(piece B)` | 0 | 8× both 200. Memo `PARTIALLY_RETURNED`, `closedAt` null. Invariants as in R7 |
| R9 | Same probe: 6× `reject ‖ reject` and `reject ‖ approve` on one converted order | 0 | Always one 200 and one `409 ORDER_ALREADY_DECIDED`. Piece is SHOP, `custodySeq` +1 exactly, 1 `SALE_REJECTED` event. An agent token calling admin reject gets 403 |
| R10 | Backfill on the scratch DB: nulled the refs of 50 events, then `pnpm db:backfill-activity-refs` twice | 0 / 0 | Run 1: `50 updated of 50 scanned in 1 batch(es)`. Run 2: `0 updated of 0 scanned`. Remaining non-ping rows without refs: 0 |
| R11 | Backfill with `DATABASE_URL` pointing at `127.0.0.1:1`: the pnpm script, and `VERCEL=1 node scripts/backfill-on-vercel.cjs`. Then without `VERCEL` | 1 / 1 / 0 | Fails closed with `PrismaClientInitializationError`, so the Vercel build fails. Without `VERCEL` it skips |
| R12 | `SELECT` of SOLD pieces with no live order, on `jewelroute` (read-only) and `jewelroute_rr` | 0 | 0 and 0. `jewelroute_rr` has 15 REJECTED conversions, all un-sold |
| R13 | `EXPLAIN` of the trigger query, plus `pg_indexes` for `OrderItem` | 0 | `Seq Scan on "OrderItem"`. The only index on the table is `OrderItem_pkey` |

## B1: reject un-sells. Resolved
- **The happy path goes through the custody choke point.**
  - `orders.ts:224` calls `unsell` (`:259-283`). It locks the Memo `FOR UPDATE`, tenant-scoped (`:262`).
  - It then calls `CustodyService.move` from SOLD to the memo's shop with reason `SALE_REJECTED`. That move takes `FOR UPDATE ORDER BY id`, verifies the expected custodian, sets `custodySeq+1`, appends a CustodyEvent and writes the outbox event and audit row in the caller's transaction.
  - It sets MemoItems from CONVERTED to OUT, recomputes the memo status, clears `closedAt`, and writes an audit row `memo.sale_rejected`. `order.rejected` carries `unsold`.
  - V10 asserts the DB rows for all of this: seq+1, event fields, outbox row, item OUT, memo ACTIVE, exposure restored, and that memo return works afterwards.
- **The SQL guard works.** The deferred constraint triggers `SamplePiece_sold_has_live_order` and `Order_dead_unsells_pieces` (`0500:13-45`) make "SOLD without a live order" uncommittable. V10 hits all three of its paths: a raw reject, a raw cancel, and a raw SOLD write.
- **Cancel is still blocked** with `409 ORDER_NOT_CANCELLABLE` (V10), and in SQL by the same trigger.
- **INV-1 and INV-2 hold.** The custody move goes only through `move`. The piece was SOLD, so it cannot be OUT on another memo, and `MemoItem_one_out_per_piece` still guards that. R7–R9 found no gaps after the races.
- **Money is unchanged.** Integer paise; the `valuePaise` on memo items is untouched; a REJECTED order is excluded from exposure.
- **Tenancy holds.** The memo and OrderItem reads filter on `ctx.user.tid`.

## B2: expand/contract and rollback. Resolved
- **Forward-only:** R2 shows only additions.
- **0400** only adds enum values, and they are not used in the same file. **0500** adds the CHECK `NOT VALID` and the triggers, which take brief locks and do no scan. **0600** runs `VALIDATE` (SHARE UPDATE EXCLUSIVE).
- **Sign-off:** the lead's decision and the real impact are written in `DECISIONS.md` (B2 entry and "Rollback plan (v3)") and in L0018.
- **The down script is correct and complete.**
  - It runs in one transaction. Its schema result matches pre-v3 exactly (R5, R6).
  - The status mapping and the data-loss list are explicit. Ledger rows are kept (`SALE_REJECTED` → `ADJUSTMENT`, via a type rewrite that does not fire the row trigger).
  - It deletes the `_prisma_migrations` rows. V11 runs forward → down → forward.
  - The rollback web build `89ec146` tolerates `SUBMITTED` (`apps/web/src/components/app/status.tsx:23`).

## M1: back-fill. Resolved as far as an immutable 0300 allows
- **`backfill-refs.ts` meets the requirements.**
  - It pages by keyset, 1k rows per transaction, using `eventRefs()`, and updates only the ref columns.
  - It is idempotent (R10, V12).
  - It runs after `tsc` in the Vercel `build` (`package.json:6`) and in `run-local.sh:80`, which uses `set -euo pipefail`.
  - It fails closed when the DB is unreachable (R11).
- **0300 still has its inline back-fill and per-order loop.** DECISIONS records the measured cost (110 s at 40k orders / 300k events, 1.9 s at demo size) and the rule for later migrations.
- **0300 has never left this machine.** The repo has no remote, so the first hosted deploy will run 0300 as-is. That is acceptable only while the hosted DB is demo-sized, and that limit is now documented.

## Findings

### Major
- **N1. Reject and convert lock Shop and Memo in opposite orders, so they deadlock.**
  - Reject takes Shop then Memo: `orders.ts:201` `lockShop`, then `:262` `Memo FOR UPDATE`.
  - Convert takes Memo then Shop: `memos.ts:252` `this.lock`, then `orders.ts:73` `credit.position(..., lock: true)`.
  - **Scenario (R7):** the manager rejects ORD-A, a conversion from MEMO-X, while the agent converts another piece on MEMO-X. Postgres detects the deadlock after `deadlock_timeout`, which is 1 s. During that second the Shop row is locked, so every order create at that shop stalls. One side gets `409 CONCURRENT_UPDATE` (`common/http.ts:79`). This happened 11 times out of 12.
  - **Impact:** no data is corrupted, because both sides roll back, but a manager-facing action fails at random.
  - **Fix, test first:** in `decide()`, when `before.sourceMemoId` is set, take the Memo lock before `lockShop`. Alternatively, have convert lock the Shop before the Memo. Add a concurrency test (reject ‖ convert, both 200).

### Minor
- **n1. The trigger guards scan the whole `OrderItem` table.** `0500:17` filters by `pieceId` and `0500:34` by `orderId`. `OrderItem` has no index except the pkey (R13).
  - Every convert pays a full sequential scan of an append-only, ever-growing table per piece, at commit. So does every reject or cancel of **any** order, including direct orders with no pieces.
  - **Fix:** add a migration with `CREATE INDEX CONCURRENTLY` on `"OrderItem"("pieceId") WHERE "pieceId" IS NOT NULL` and on `("orderId")`, each in its own file.
- **n2. The stated reason for re-adding `SUBMITTED` is inaccurate.** `0400:5-6` and the `schema.prisma` comment say it helps "a still-serving older deployment". It cannot: the pre-v3 client still fails on every `CONFIRMED` row (prior review R8; this follows from the data and was not re-run), and its SUBMITTED writes now hit `Order_no_submitted`. The down script goes through TEXT, so it does not need the value either. The value is harmless but inert, and it puts `SUBMITTED` back into the Prisma TS type. Correct the comment.
- **n3. Nothing detects or repairs pre-fix orphans.** These are SOLD pieces whose only order is a REJECTED conversion. The new triggers only fire on new transitions, so an existing orphan stays stuck and is never reported.
  - It is 0 locally (R12). The hosted DB is unknown.
  - The same orphan can be re-created during a rollback window: the pre-v3 code rejects a SUBMITTED conversion without un-selling it.
  - **Fix:** add the R12 query to the rollback plan's re-forward step and to the deploy checklist.
- **n4. The runbook does not say the rollback locks key tables.** `down.sql:53` rewrites `CustodyEvent`, and `Order` is rewritten twice, all under ACCESS EXCLUSIVE. The ledger is the largest table, so expect a full outage proportional to its size. Add this to DECISIONS › Rollback plan.
- **n5. m1 from the first review is still open.** The back-fill script skips rows that have any ref set, so the SQL-vs-TS mismatch on empty-string ids from 0300 is not repaired. The comment at `backfill-refs.ts:3`, "cannot drift", applies only to rows that had no refs.
- **n6. The back-fill rescans ref-less rows on every Vercel build.** Non-ping events for which `eventRefs()` yields nothing are scanned again each time. The cost is small today (0 such rows, R10). Note it, or add a marker if it grows.

## Checklists
- **Invariants:**
  1. Units: PASS.
  2. DB and domain guards: PASS, with major N1 on lock ordering.
  3. Failing test per invariant: PASS (V10 hits the SQL guard).
  4. Known-answer maths: not affected.
  5. Choke points: PASS.
  6. Snapshots: PASS. `views.ts:148` only adds `shopId`/`asOf` defaults under the frozen snapshot.
  7. Failure modes: PASS (R9; and R7 rolled back cleanly).
  8. Tenancy: PASS.
  9. Secrets and PII: PASS. The CRON secret was passed by shell substitution and never printed.
  10. Audit: PASS.
- **Migrations:** forward-only PASS · schema agreement PASS (R5) · units and tenancy n/a · invariants in SQL PASS · lock risk PASS for 0400–0600 (n1 is a runtime cost, not a lock) · expand/contract PASS · applies cleanly PASS (R3, R5) · reversibility PASS (R5, R6, V11). **APPROVE.**
- **Verifier:** gates are green (R1, R4). Every promise in the commit message has evidence from a DB row or a command. **APPROVE.**

**OVERALL: APPROVE.** Fix N1 (test first) before a non-demo tenant or heavy concurrent use. n1–n6 are follow-ups.
