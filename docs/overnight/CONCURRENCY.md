# Concurrency suite ×20 (BACKLOG #4) — 22 Oct 2026, wt-conc

`apps/api/test/concurrency.test.ts` — real HTTP against `dist/main.js` on Postgres, `Promise.all` of 20 requests per scenario, in a fresh signup workspace per run (rerunnable). Run alone:
`TEST_DATABASE_URL=… TEST_PORT=… pnpm --filter @jewelroute/api exec node --import tsx --test test/concurrency.test.ts` (after `tsc -p tsconfig.build.json`).

**After every scenario `invariants()` checks the whole workspace from the DB:**
1. one custodian per piece (`custodianType` matches the custodian columns);
2. custody ledger contiguous per piece (`seq` = 1..`custodySeq`, each event starts where the previous ended, the last one is where the piece is);
3. at most one OUT memo item per piece, an OUT item's piece is at that memo's shop, no SOLD piece without a live order (`findSoldOrphans`);
4. no duplicate orders/memos (distinct `clientOpId`);
5. every order line reprices with `priceDesign` at its own frozen `GoldRate` row, totals = `orderTotals(lines)`, one frozen rate per purity, the frozen credit decision recomputes with `creditPosition` and agrees with the status;
6. every shop's `GET /admin/shops/:id/credit` = opening + Σ live unsettled orders + Σ OUT memo values summed from rows;
7. outbox exactly once: per order one `order.created` + one `order.confirmed|pending_approval` + one decision event iff decided (+ `order.settled` iff settled); per memo one `memo.created` (+ `memo.acknowledged` iff acknowledged); per visit one `visit.checked_in` iff checked in, one `visit.completed` iff completed; one `sample.custody_changed` per move whose payload pieces/seqs equal the ledger rows stamped with its id.

The server runs with `connection_limit=8` (8 racing transactions at once; the shared local Postgres caps at 100 connections and other agents hold ~60). C2b/C5/C6 start requests with 0–60 ms jitter so writes interleave instead of all queueing behind the first lock.

| # | scenario | requests (×20) | outcome distribution (one run; others vary in the split, never in the rule) | scenario-specific DB assertions | result |
|---|---|---|---|---|---|
| C1 | two tabs of one agent + a second agent memo the same piece | 8 same key, 8 new keys (agent A), 4 agent B | `201`×1, `409 PIECE_NOT_IN_YOUR_CUSTODY`×19 | every 201 is the same memo; B never wins; one MemoItem for the piece; piece at the shop, `custodySeq` 3 | PASS |
| C2a | check-in on two visits of one agent at once | 7 V1 same key, 7 V1 new keys, 6 V2 | `200`×7 (winner + same-key replays), `409 ALREADY_CHECKED_IN`×7, `409 ANOTHER_VISIT_OPEN`×6 | all 200s the same visit; exactly one open visit; one `visit.checked_in` across both | PASS |
| C2b | complete-visit races orders and memos on the same visit | 1 complete, 9 orders, 10 memos | `200`×1, `201`×10, `409 VISIT_NOT_OPEN`×9 | `visit.completed` payload counts = orders/memos on the visit (nothing sold after close); visit COMPLETED | PASS |
| C3 | approve vs reject vs cancel vs settle on one PENDING_APPROVAL order; then on a memo-converted one | 5 each | plain: `200`×2 (approve + settle), `409 ORDER_ALREADY_DECIDED`×9, `ORDER_NOT_CANCELLABLE`×5, `ORDER_ALREADY_SETTLED`×4 · converted: `200`×1, `ORDER_ALREADY_DECIDED`×9, `ORDER_NOT_CANCELLABLE`×5, `ORDER_NOT_SETTLEABLE`×5 | one decision event; settle only after approve, once; `order.settled.data.status` and the settle audit before-image = `APPROVED`; a rejected conversion un-sells exactly once (one `SALE_REJECTED`) | **FAIL → fixed** `06bb728` |
| C4 | reject of a memo-converted pending order vs converts of the same memo | 1 reject, 10 convert A (the rejected piece), 9 convert B | `200`×3 (reject, B once, A re-sold once after the reject), `409 PIECE_NOT_ON_MEMO`×17 | B converts exactly once; A re-sold at most once and only after the reject (piece/memo item agree: SOLD+CONVERTED or SHOP+OUT); first order REJECTED; no orphans | PASS |
| C5 | gold-rate changes during order booking | 12 orders (2 agents, 22K+18K lines), 8 rate inserts (both purities) | `201`×20 | 8 new append-only rate rows; each order froze exactly one rate per purity (7–8 distinct rates used across 12 orders); lines reprice at their own rate; `order.created` carries the frozen snapshot | PASS |
| C6 | credit-limit PATCH during booking | 12 orders (2 agents), 8 PATCHes (distinct limits) | `200`×8, `201`×12 (5–6 confirmed / 6–7 pending, 6 distinct limits seen) | every frozen limit is one that was set; replayed in shop-lock order (ORD number) each decision saw every earlier confirmed order; no CONFIRMED order over its limit; the `shop.update` audit trail is a chain (distinct before-images) | **FAIL → fixed** `06bb728` |
| C7 | retailer QR confirm and agent OTP verify on one memo | 10 public confirm, 10 OTP verify | `200`×20 | ACKNOWLEDGED; exactly one `memo.acknowledged`, one `memo.ack` audit | PASS |
| C8 | one refresh token presented ×20 at once (same user agent) | 20 | `200`×2, `401 INVALID_REFRESH_TOKEN`×18 | both 200s return the SAME successor; exactly one successor row minted; grace spent once; then theft revoked every live token (successor 401 too) — DECISIONS "Refresh reuse grace" | PASS |
| C9 | `POST /v1/internal/dispatch` across two API instances on one DB | 10 to instance 1, 10 to instance 2; 10 due FAILED deliveries | `200`×20 | each delivery attempted once in its due window (attempts 1→2, SUCCEEDED); `attempts` = WebhookAttempt rows; receiver: 10 sends for 10 deliveries, max 1 concurrent send per delivery | PASS |

## Bugs found and fixed (`06bb728`)
- **Stale shop PATCH audit (C6).** `patchShop` read the before-image before `SELECT … FOR UPDATE` on the shop; 9 concurrent limit changes audited only 2 distinct `before` values. Now read under the lock.
- **`order.settled` carried the wrong status (C3).** `settle` read the order before the shop lock; an approve committing in between left the webhook payload and audit saying `PENDING_APPROVAL` for an order settled as `APPROVED`. Now the row is read after the shop lock (every order status write holds it). Lock order unchanged.

## Not covered / notes
- Memo create and memo return change memo exposure without the shop lock (memos are not credit-gated). An order's decision is still consistent with a serial order (its memo-exposure sum is one statement), so nothing failed; noted in case memos become credit-gated.
- C9 shares SKIP LOCKED across two processes; one process also coalesces concurrent `runOnce` calls in memory.
