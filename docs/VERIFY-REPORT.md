# JewelRoute — independent verification report

- **Verifier:** fresh-context verifier. I did not build any of this, and my default verdict is REJECT. I changed no product code.
- **Tree:** `7e34424` (plus `bab2f66`, a docs/report-only commit another agent landed during the run).
- **Date:** 21 Oct 2026, about 13:45–14:45 IST. The API ran on :4000 and the web app on :3000 (next dev), with a fresh seed.
- **Scripts and screenshots:** the scratchpad `verify/` folder. The scripts are `scenario.js`, `failures-api.js`, `failures-ui*.js`, `memo502.js` and `noproof.js`, and the screenshots are in `verify/shots/`.

## Verdict: **REJECT**

The core loop is genuinely solid. All 28 brief steps pass through the real UI with two personas and no reloads. Every data-integrity failure case also holds: idempotency, custody, tenancy, rate snapshots and the webhook ladder.

The verdict is still REJECT, for three reasons:

1. **The gate is red.** On the recorded run, `pnpm verify` exited 1. The cause is a flaky T3 test (`records.test.ts` R4, batch approve) that failed once in 4 runs.
2. **The backend accepts orders and memos before the arrival photo.** The "photo before selling" rule is enforced only by the UI, so custody can move on a visit that has no proof. This breaks the brief's "UI is not allowed to invent state / backend remains source of truth".
3. **The memo flow lies after a server-committed error.** If the server commits a memo but the client gets a 5xx, the UI says *"Custody didn't change"*. Meanwhile the piece silently leaves the draft and the retailer acknowledgement QR is skipped.

---

## A. Gate receipts

| Command | Exit | Key lines |
|---|---|---|
| `pnpm verify` (repo root) | **1** | shared build ✓, shared test 4/4 ✓, api typecheck ✓, **api test 29/30 ✗**, web typecheck ✓, web lint ✓, harness 102/102 ✓. The failing test is `R4. batch approve …` → `failed rows leave no audit — 1 !== 0` (`apps/api/test/records.test.ts:143`). Result: `VERIFY FAILED: api test`. |
| `pnpm --filter @jewelroute/api test` (rerun ×3) | 0, 0, 0 | 30/30 each time. R4 is order-dependent: see finding M3. |
| `pnpm --filter @jewelroute/web build` (in a scratch copy of the tree, so the :3000 `.next` was untouched) | **0** | `✓ Compiled successfully in 39.6s`, 1m37s. |
| `BASE_URL=http://localhost:4000 CRON_SECRET=… pnpm --filter @jewelroute/api e2e` | **0** | `E2E PASSED — 28 checks`. |
| `POST /v1/internal/seed` | 200 | `{tenant:"aurum", shops:10, designs:16, pieces:46, visits:17, orders:6, memos:2, rahulBag:11}`. Reseeded after the e2e, after every run and at the end. |

**Environment note:** the :3000 dev server stopped partway through my run. I don't know why; the `docs/report` commit landed at about the same time. I restarted it with `pnpm dev:web` from the repo root. Every result below comes from a complete run after that restart.

## B. The 28-step scenario through the real UI (Playwright)

**Setup:** three browser contexts.
- Priya: admin, 1440×900. She had Home, Sharma's shop record, the AJ-S-000123 sample record, the visit record, Orders, Memos and Integrations open in tabs **before** Rahul acted. Freshness was judged by polling only, with no reloads.
- Rahul: 390×844, `isMobile`, geolocation granted. The geolocation was emulated at 600 m and then 30 m north of Sharma (28.6519, 77.1907).
- Retailer: a third mobile context for the ack link.

Prices were recomputed independently from `/admin/designs` with my own BigInt half-up maths.

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | Admin sets 22K rate (Settings → Set rate → ₹10,612.50) | PASS | API current K22 = 1061250 paise/g. The card displays **₹10,613/g** (see m1). `shots/01a-set-rate-dialog.png`, `01b-rate-set.png` |
| 2 | Sharma is assigned to Rahul today | PASS | The admin Visits row is PLANNED at 10:30. `02-admin-visits-today.png` |
| 3 | Rahul logs in | PASS | Lands on `/field/today`. `03-rahul-login-landing.png` |
| 4 | Today shows Sharma | PASS | First stop, `nextVisitId` matches, bag 11. `04-today.png` |
| 5 | Opens the visit | PASS | `05-visit-open-600m.png` |
| 6 | GPS validated against Sharma's coordinates | PASS | "Location verified · 30 m". `06-location-verified-30m.png` |
| 7 | Invalid location (600 m) fails | PASS | The Check in button is disabled and the UI says "599 m · Outside the zone". A direct POST returns `409 OUTSIDE_GEOFENCE {distanceM:599, radiusM:100}`. `07-outside-600m.png` |
| 8 | One check-in only (button **double-clicked**) | PASS | Exactly 1 `visit.checked_in` event. The Visit row reads CHECKED_IN, VERIFIED, 29.97 m. `08-checked-in-proof-stage.png` |
| 9 | Uploads a real JPEG | PASS | 1200×900 JPEG, re-encoded to 172,529 B. `09-proof-uploaded-workspace.png` |
| 10 | Proof attaches to the correct visit | PASS | `VisitProof.visitId` = this visit. Status ACTIVE, `resume.nextStep` = SELL_OR_COMPLETE. |
| 11 | Opens the catalog | PASS | 16 design cards. `11-catalog.png` |
| 12 | Prices reflect the current rate | PASS | All 16 cards equal net g × the rate Priya set + making + stones + other + 3% GST, within ₹0.50. The cards show whole rupees, for example AJ-BNG-1803 shows ₹96,483 against an exact 9,648,340 paise. |
| 13 | Creates an order | PASS | ORD-2026-00037 total 65,019,857 paise, matching my independent figure exactly. `13a-order-review.png`, `13b-order-booked.png` |
| 14 | Rate snapshot frozen; Priya changes 22K to ₹10,800 | PASS | The order total is unchanged (65,019,857) and the snapshot stays 1061250. The order record shows "Priced at 22K ₹10,613/g … today ₹10,800/g (+₹188)", which is a rounding artefact (m1). `14-order-after-rate-change.png` |
| 15 | Picks AJ-S-000123 + one more | PASS | AJ-S-000136 was the second piece. `15-memo-picker.png` |
| 16 | Backend verifies possession | PASS | A memo with Kavya's AJ-S-000126 returns `409 PIECE_NOT_IN_YOUR_CUSTODY`. |
| 17 | Creates a 5-day memo | PASS | MEMO-2026-00013, due 26 Oct, 2 pieces, ack link shown. `17a-memo-review.png`, `17b-memo-created-qr.png` |
| 18 | Memo and custody are atomic | PASS | `CustodyEvent` seq 3 AGENT→SHOP has `memoId`, `visitId` and `outboxEventId`, and the piece is SHOP/Sharma/seq 3. Code review: `memos.ts:110-160` runs in one `idem.run` transaction. |
| 19 | Sample custodied by Sharma | PASS | The sample tab, opened before the memo, updated by polling. `19-sample-record-after.png` |
| — | Retailer ack via `/ack/<token>` | PASS | `ackStatus` ACKNOWLEDGED (QR_CONFIRM). Rahul's QR screen flipped by itself. `20a-retailer-ack-page.png`, `20b-retailer-acked.png`, `20c-rahul-sees-ack.png` |
| 20 | Gone from Rahul's bag and catalog availability | PASS | Gone from the bag UI and from `availablePieces`. Today's bag went 11 → 9. `20d-bag-after-memo.png` |
| 21 | Manager Home updates | PASS | The feed has the memo, the order and "completed the visit at Sharma". Live field activity shows Rahul 1/4. `21-home-after.png` |
| 22 | Shop record shows the memo | PASS | Memo, order and activity all present. `22-shop-after.png` |
| 23 | Sample record shows the custody transfer | PASS | Ledger #3 shows the memo, Sharma at 28.65217, 77.19070, "GPS verified · 30 m", the proof thumbnail and `evt_01M5EV…` (truncated, with a copy button). `23-sample-record-ledger.png` |
| 24 | Visit record links the order, memo and proof | PASS | `24-visit-record-after.png`. Also checked: the Orders list (`24b`), Memos list (`24c`) and Memo record with custody timeline + "Acknowledged by QR" (`24d`). |
| 25 | Webhook events created | PASS | Outbox has one each of visit.checked_in, visit.proof_uploaded, order.created, memo.created, sample.custody_changed and visit.completed. |
| 26 | Worker delivers | PASS | All six SUCCEEDED, and the built-in receiver reports `signatureOk=true` for each. |
| 27 | Integrations log updates | PASS | All six event types are visible, Delivered, HTTP 200, attempt 1/7, with no reload. `27-integrations-after.png` |
| 28 | Completing the visit updates Today and admin | PASS | Today reads "1 of 4 visits completed". The admin visit is COMPLETED, proofState VERIFIED, with the outcome order and memo. `28a-complete-sheet.png`, `28c-today-after-complete.png` |

**Console and network across the run:** the only console errors were the two 409s I triggered on purpose (the 600 m check-in and the foreign-piece memo). There were no page errors and no other failed API calls.

## C. Failure cases

| Case | Result | Evidence |
|---|---|---|
| Duplicate order (5× the same key, concurrently) | PASS | All five return 201 with the same order id, and the orders on the visit go +1. No key → `400 IDEMPOTENCY_KEY_REQUIRED`. Same key with another body → `422 IDEMPOTENCY_KEY_REUSED`. |
| Duplicate memo (4× the same key, concurrently) | PASS | 4×201, 1 MemoItem, 1 custody→SHOP event. |
| Double check-in | PASS | UI: double-click gives 1 event. API: 2 calls with the same key plus 2 with new keys, concurrently, return 200, 200, 409 ALREADY_CHECKED_IN, 409, and there is 1 event. |
| Bad GPS | PASS | lat=123 → 400. 1.1 km → 409 OUTSIDE_GEOFENCE. 160 m at ±5000 m → outside (slack capped at 50 m). 140 m at ±5000 m, or 60 m with no accuracy → inside, recorded LOW_ACCURACY. |
| Completing without proof | PASS | Before check-in → 409 VISIT_NOT_OPEN. Checked in with no photo → `409 PROOF_REQUIRED`. In the UI the photo stage has no Complete action (`F-refresh-after-checkin.png`). |
| **Selling without proof** | **FAIL (M1)** | After check-in with no photo, `POST /memos` → **201** (the piece moved to SHOP) and `POST /orders` → **201**. `resume` = `{canSell:true, nextStep:"UPLOAD_PROOF"}`. |
| Leaving a sample not held (API as Rahul) | PASS | Arjun's piece, a vault piece or a piece already on a memo → 409 PIECE_NOT_IN_YOUR_CUSTODY. An unknown id → 404. |
| Double assignment (3 concurrent memos with different keys) | PASS | 201, 409, 409. One OUT MemoItem. The losing two-piece memo rolled back entirely, so its other piece stayed with the AGENT. Admin issue of an on-memo piece → 409 PIECE_NOT_IN_VAULT. Ledger seqs are 1, 2, 3 with no gaps. |
| Concurrent issue of one vault piece to two agents | PASS | 200 and 409 PIECE_NOT_IN_VAULT. |
| Failed webhook → ladder → DEAD → manual retry | PASS | Ran with a `fail-` receiver; I moved `nextAttemptAt` back in time and triggered dispatch. Ladder: 1 FAILED (+30 s) → 2 (+2 m) → 3 (+10 m) → 4 (+30 m) → 5 (+2 h) → 6 (+6 h) → 7 **DEAD**. Manual retry by API → attempts 8, still DEAD, with 8 entries in `attemptLog`. The Integrations UI "Retry" on the dead-letter row also works (7:DEAD → 8:DEAD). `F-webhook-after-ui-retry.png` |
| Gold-rate change after old orders | PASS | 22K → ₹12,000 and 18K → ₹9,900: all 8 order totals and the OrderItem hash are unchanged. A direct SQL `UPDATE "OrderItem"` is rejected by the trigger. |
| Refresh after check-in, before photo | PASS | Reload lands on the photo step. `F-refresh-after-checkin.png` |
| Photo attach fails, then refresh | PASS | The attach was aborted, then the page reloaded. "Retry upload" is offered with the same bytes, and the retry gives 1 VisitProof. `F-proof-after-reload-retry.png` |
| Refresh mid-cart | PASS | The cart ("2 items · 33.60 g") and the review step both survive the reload. `F-refresh-mid-cart.png` |
| API error during order submit | PASS | The first POST reached the server, which committed, but the client got a 500. The UI showed "Place order again". A double-tapped retry → exactly 1 order (the key replays). `F-order-500.png` |
| **API error during memo submit** | **PASS for data, FAIL for UX (M2)** | Same setup with a 502. Exactly 1 memo, but the alert says "Custody didn't change". Within 800 ms the view jumps back to the bag with the piece silently gone, and no ack QR is shown. `F-memo-502.png`, `F-memo-502-t800.png` |
| Tenant A ↔ B (tenant B created with SQL plus its admin API) | PASS | B reading 9 A ids (v1 + v2) → all 404. B's writes (approve, batch approve, PATCH shop, return-to-vault, memo extend) → 404, or `NOT_FOUND` inside the batch result, and the A order stays SUBMITTED. B's lists and search contain 0 A rows. A admin → B shop gives 404 and Rahul gets 403. Tenant B was purged afterwards. |
| **T3 batch approve race** | PASS (with m4) | Ran 5 concurrent batches with shuffled ids, plus a single approve, a single reject and a batch with duplicate ids. Each order was decided exactly once, with 1 audit row and 1 decision event. 201 ids → 400, and 200 unknown ids → 200 with failed=200 in 353 ms. |

**T3 batch-approve code review** (`apps/api/src/modules/orders.ts:161-201`):
- Each order runs `decide()` in its own transaction.
- The decision is a guarded `updateMany … WHERE status='SUBMITTED'`. Under READ COMMITTED, a concurrent loser re-checks the row after the winner commits and gets `count 0`, so it never writes an audit row or outbox event.
- Audit and outbox are written in the same transaction as the update.
- Duplicate ids are collapsed and failures are isolated per order.

The logic is correct. The problems are the error text (m4) and the flaky test (M3).

## Findings

### Blocker
None found at the data-integrity level. Taken together, M1–M3 still block approval.

### Major

**M1. Orders and memos are accepted before the arrival photo; the rule exists only in the UI.**
- **Code:** `apps/api/src/modules/visits.ts:416` has `canSell: open`. `orders.ts:133` and `memos.ts:113` call only `requireOpen`, which checks CHECKED_IN/ACTIVE. The web adds `&& proofs.length > 0` itself in `components/field/sale/sale-view.tsx:38`.
- **Repro:** reseed; `POST /v1/visits/<sharma>/check-in` with Sharma's coordinates; skip the proof. `POST /v1/memos {visitId, pieceIds:[<bag piece>], dueDate:+3}` → 201 and the piece becomes SHOP. `POST /v1/orders` → 201. `GET /v1/visits/:id` → `resume.canSell:true` while `nextStep:"UPLOAD_PROOF"`.
- **Impact:** custody and money can move on an unproven visit. The backend and the UI disagree about the state machine.
- **Repro script:** `verify/noproof.js`.

**M2. Memo submit after a server-committed 5xx misinforms the agent and skips the retailer acknowledgement.**
- **Code:** `components/field/sale/memo-review.tsx:269-272` shows a hard-coded "Custody didn't change" for any ≥500 error and calls `sync("memo.created")`. The bag refetch then drops the piece from the draft (`sale-view.tsx:47-52`), and `mp.items === 0` exits the review step.
- **Repro:** run `verify/memo502.js`. It routes the first `POST /api/v1/memos` through `route.fetch()` and then fulfils it with a 502.
- **Result:** 1 memo is created and the piece is SHOP, but the agent sees the bag without the piece and no QR. The memo only appears later on the visit timeline, with "Show QR again". The order flow, by contrast, handles the same situation well.
- **Fix direction:** on ≥500, retry with the same key before saying anything about custody, or query the memo by key, so the agent lands on the ack screen.

**M3. The gate is flaky: `records.test.ts` R4 depends on test order.**
- **Code:** `apps/api/test/records.test.ts:121` picks `decided = findFirst({status:'APPROVED'})` with no `orderBy`. That can return the order that R1 approved a few seconds earlier (line 28), so the assertion "no `order.approve` audit in the last 60 s" (line 143) fails even though the product behaves correctly.
- **Evidence:** failed in the `pnpm verify` run and passed in 3 reruns.
- This is a T3 gate, so a red or green result is meaningless until the test is fixed. Pick an order approved by the seed, or assert on audit rows created after the batch request.

### Minor

- **m1. Rate display rounds to whole rupees, so money shown misstates the stored value.**
  - `formatRate` (`packages/shared/src/format.ts:19`) uses the `inr` formatter with no paise.
  - A ₹10,612.50 rate shows as ₹10,613 in the toast "22K set to ₹10,613/g", on the Settings card, in the catalog strip and on the order record's **frozen** "Rate used / Priced at 22K ₹10,613/g".
  - The deltas are off too: "+₹73" where the true change is +₹72.50, and "+₹188" where it is +₹187.50.
  - Related money-rule issue: the rate input parses with `parseFloat(...) * 100` (`components/admin-v2/sales/gold-rate.tsx:37`).
- **m2. Order review shows the wrong "rate as of" time.** `components/field/sale/order-review.tsx` uses `rates[0].effectiveFrom`, not the rate for the line's purity. With 22K set at 1:53 pm the screen read "At 22K ₹10,613/g, rate as of 10:00 am", while the catalog strip on the previous screen said "as of 1:59 pm". `13a-order-review.png`
- **m3. Order review line amounts include GST but sit above a pre-GST subtotal.** Lines read ₹3,68,892 + ₹2,81,307 with "Subtotal ₹6,31,261". It sums correctly to the total but reads inconsistently.
- **m4. Race-loser errors carry a stale status.** `decide()` reads `before` without a lock, so the loser's message is "Order ORD-… is already **SUBMITTED**" (seen in the race test). Re-read the row after `count !== 1`.
- **m5. The sidebar "22K today" goes stale in other tabs.** `components/app/shell.tsx:52` has `staleTime` 60 s and no polling. Tabs opened before a rate change kept showing ₹10,613 while the page body showed ₹10,800 (`23-sample-record-ledger.png` from the first run).
- **m6. The demo receiver records failed deliveries as received and "Signature verified".**
  - It stores rows for `fail-` tokens before returning 500 (`webhooks.module.ts:254-267`).
  - The "Test receiver" tab lists rows from every endpoint, not the one selected: 8 identical `ping` rows from the dead-lettered endpoint appear under the built-in receiver. `F-webhook-test-receiver.png`
  - `POST /v1/dev/webhook-receiver/:token` is public in every environment and stores rows even for unknown tokens (`tenantId` null).
- **m7. Visits list hides Status at 1440 px.** With 10 columns, Outcome is cut and Status sits off-screen behind horizontal scroll. Status is the most important column for verification. `02-admin-visits-today.png`
- **m8. Admin at 390 px.** The Samples view-tabs row and Catalog overflow their containers; the page itself does not scroll sideways. Admin is laptop-first, so this is noted only. `O-admin-390-_admin_samples.png`
- **m9. Memo idempotency fallback returns `ack: null`.** The `isUniqueViolation` path in `memos.ts` returns `ack: null`, so a client replay through that path gets no ack link.
- **m10. Visit record says "Last visit: No value" for Sharma.** This is in the Shop section of the visit record, on a shop visited minutes earlier. It likely means "previous visit" and needs a clearer label.

## D. Product and UX review

- **Attio closeness (admin):** strong. Compared against `scratchpad/attio/*.png`, these match closely: the sidebar (workspace row, ⌘K search, sectioned nav with tinted object icons), the title bar, the view and filter bars, the hairline grid table with a count footer, and record pages with a left property panel plus tabs, highlights and activity. Density and type scale are right, and there are no gradients or giant cards.
  - The Home page is exception-first (Needs attention with amounts and ages), not a KPI template.
  - Small departures: no checkbox column on hover in some tables, and no visible "Sorted by" chip on Visits.
- **Field at 390 px:** good one-handed design. Primary actions sit in a sticky bottom bar with targets of 44–48 px, there are clear stage indicators (Check in → Arrival photo → Sell and complete), the next stop dominates on Today, and errors stay beside the primary action.
  - The Next.js dev indicator overlaps the bottom-left of the primary buttons. It is dev-only; check that it doesn't ship.
  - The check-in map was blank in `05`/`07`, probably because tiles were still loading in the sandbox. The Today and admin maps rendered.
- **States the backend can produce but the UI doesn't model:** M1 (canSell before proof). After a partial memo failure the UI also invents a state ("Custody didn't change"), which is M2.
- **Stale surfaces:** only the sidebar rate (m5). Every record and list page I held open before the run converged within one polling interval (10–20 s).
- **Broken links:** none found in the paths I walked.
- **Console errors:** none apart from the 409s I triggered on purpose.
- **Layout overflow at 390/768/1440:** no horizontal page overflow on 7 field routes at 390/768 or on 16 admin routes at 768/1440. The only overflow was in the admin 390 px sub-elements (m8).

---

## Fixes after verification

- **Fixer:** the builder agent, working from this report. The fixes are not self-approved: a fresh `/verify` still decides `passes`.
- **Date:** 21 Oct 2026, about 14:50–15:40 IST, on top of `1384bac`.
- **Scripts and screenshots:** the scratchpad `fixcheck/` folder (`m1-ui.js`, `m2-memo.js`, `m2-order.js`, `admin.js`, `m5.js`, plus `shots/`).
- **Backend rule:** every backend fix got a failing test first (red, then green).

### Finding → fix → evidence

| # | Fix | Evidence |
|---|---|---|
| **M1** | `VisitsService.requireProof` runs inside the write transaction. It is called by `POST /orders`, `POST /memos`, and by memo `return`/`convert` when they act on a visit (explicit `visitId`, or the caller's open visit at that shop). It returns **`409 PROOF_REQUIRED_BEFORE_SALE`** and writes nothing; the key is rolled back. `resumeState` now sets `canSell = open && proofCount > 0`, which agrees with `nextStep`. On the web, `sale-view`, `workspace` (Create order / Leave on memo / Return / Sell) use only `resume.canSell`. The error is mapped to "Add the arrival photo on this visit first…". | API tests: `1c` (red: `canSell must agree with nextStep`, then green), `F5` (`canSell:false` → `true`), `F14` (return/convert ×2 → 409 before the photo, then 200). UI (`m1-ui.js`): `resume {canSell:false, nextStep:"UPLOAD_PROOF"}`, 11/11 memo checkboxes disabled, 0 quick-add buttons, API memo → `409 PROOF_REQUIRED_BEFORE_SALE`. Screenshots: `shots/M1-memo-no-proof.png`, `M1-order-no-proof.png`. Seed check: 0 orders, memos or returns on a proofless visit. |
| **M2** | `sendConfirmed` (`components/field/guard.ts`) treats a network error, a 5xx or `IDEMPOTENCY_IN_PROGRESS` as **unknown**. It shows "We couldn't confirm the memo. Checking…" and re-sends the **same** Idempotency-Key. A replay answers with the committed memo and its ack, and the UI goes to the QR. If the answer is still unknown, the UI keeps the draft and the key and offers **Retry**. While unconfirmed, the draft is frozen (`SaleDraft.memoPending`), so a bag refetch can't drop the pieces. A null `ack` on replay is reissued through `/ack/link`. Orders use the same pattern. The return/convert drawers no longer claim "Custody didn't change" on a 5xx. | `m2-memo.js` run A (commit, then 500): 2 POSTs with the same key, "Checking…" shown, ends on the QR, **1 memo**, piece SHOP. Run B (commit, then 500, then the re-check reset): 3 POSTs with the same key, the unconfirmed message, the piece still in the draft, no "Custody didn't change", Retry → QR, **1 memo**. `m2-order.js`: 2 POSTs with the same key → "Order booked", **1 order**. Screenshots: `shots/M2-memo-A-…-checking.png`, `M2-memo-B-…-unconfirmed.png`, `M2-memo-A-…-qr.png`, `M2-order-booked.png`. |
| **M3** | R4 now creates and approves its own "already decided" order (`o3`). It asserts that the audit and event counts for `o3` are unchanged by the batch, instead of using "some APPROVED order in the last 60 s". | `pnpm --filter @jewelroute/api test` ×5 in a row: exit 0 each time, 32/32. |
| m1 | `formatRupees` / `formatRate` / `formatRateDelta` (integer paise, paise shown only when non-zero) and `parseRupeesToPaise` (no `parseFloat`) in `packages/shared/src/format.ts`. They are used in the rate dialog, rate cards and history, order record (frozen rate + delta), catalog strip, sidebar, and the audit summary. | `format.test.ts` (red: missing exports; green: 8/8 shared). `admin.js`: toast "22K set to ₹10,612.50/g", dialog "(+₹72.50/g)", card "₹10,612.50/g +₹72.50 vs previous", order "Priced at 22K ₹10,612.50/g", "Today's 22K rate is ₹10,800/g (+₹187.50)". Screenshots: `m1-set-rate-dialog.png`, `m1-order-frozen-rate.png`. |
| m2 | The order review prints one clause per purity priced, each with its own rate row's time. | `m2-order.js`: "At 18K ₹8,630/g (rate as of 10:00 am)". |
| m3 | Order review line amounts are before GST, so they sum to the Subtotal shown. | Code: `order-review.tsx` uses `unitPricePaise × qty`. |
| m4 | `decide()` re-reads the committed row after `count !== 1`. It reports `ORDER_ALREADY_DECIDED` with `details {status, decidedBy, decidedAt}` and the message "…was already approved by Priya Mehta". The admin UI says "Already approved by Priya Mehta." and refetches on any 409. | API test `9`: the 5× approve-vs-reject race always reports the winner's status, and the batch message is asserted in `R4`. `admin.js`: toast "Already approved by Priya Mehta.", page then shows Approved. Screenshot: `m4-already-approved.png`. |
| m5 | The sidebar rate query polls every 60 s and always refetches on focus. `gold_rate.set` already invalidates `qk.goldRates` (`lib/sync.ts`, confirmed). | `m5.js`: tab opened before the change → `₹10,612.50/g` 1 s after focus, `₹10,625.75/g` by polling alone after 60 s. |
| m6 | Receiver: unknown token or disabled → 404 and nothing stored. A `fail-` token → 500 and nothing stored. A bad signature is stored as `signatureOk:false` → 401. So no failed delivery can show "Signature verified". It is gated by `ENABLE_DEMO_RECEIVER` (unset: on outside production; in production only for demo-mode tenants; documented in `.env.example`, README, CONTRACT). `GET /received?endpointId=` lets the Test receiver tab list only the selected endpoint. | API tests `7` (the failing endpoint leaves 0 received rows) and `7b` (404 unknown, 401 + `signatureOk:false`, per-endpoint filter, gating truth table). `admin.js`: the built-in tab lists 5 rows, all its own. Screenshot: `m6-receiver-builtin.png`. |
| m7 | Visits uses the fixed-layout table like Shops. Status is the 2nd column, the widths sum to 1,146 px, and the agent name truncates. | `admin.js` at 1440: table `scrollWidth 1200 = clientWidth 1200`, Status right edge 569 px, last column ends at 1440. Screenshot: `m7-visits-1440.png`. |

**Not changed:**
- m8: admin at 390 px.
- m10: the "Last visit" label.
- m9: the server fallback still returns `ack:null`, but the field client now reissues the link in that case.

### Gate receipts (after the fixes)

| Command | Exit | Key lines |
|---|---|---|
| `pnpm verify` ×3 (repo root) | **0, 0, 0** | shared build ✓, shared test 8/8, api typecheck ✓, api test 32/32, web typecheck ✓, web lint ✓, harness 102/102, `VERIFY PASSED` |
| `pnpm --filter @jewelroute/api test` ×5 | **0 ×5** | 32/32 each |
| `pnpm --filter @jewelroute/web build` (scratch copy, `.next` of :3000 untouched) | **0** | `✓ Compiled successfully in 32.6s` |
| `BASE_URL=http://localhost:4000 CRON_SECRET=… pnpm --filter @jewelroute/api e2e` (rebuilt + restarted API) | **0** | `E2E PASSED — 28 checks` |
| `POST /v1/internal/seed` | 200 | reseeded afterwards: `{shops:10, designs:16, pieces:46, visits:17, orders:6, memos:2, rahulBag:11}` |

---

## Re-verification (independent, default REJECT)

- **Verifier:** the same independent verifier as above. I reran every check myself on `60ca20b`; none of the fixer's receipts above were reused as evidence.
- **Date:** 21 Oct 2026, about 15:15–15:35 IST.
- **Scripts and screenshots:** the scratchpad `verify/` folder. The scripts are `reverify-ui.js`, `reverify-memo.js`, `m1return.js`, `noproof.js`, `failures-api.js` and `scenario.js`; the screenshots are `shots/R-*`.

### Gates

| Command | Exit | Key lines |
|---|---|---|
| `pnpm verify` ×3, back to back | **0, 0, 0** | Each run: api test 32/32, shared 8/8, harness 102/102, web typecheck and lint ✓, `VERIFY PASSED` (tree `60ca20b`). |
| `pnpm --filter @jewelroute/web build` (scratch copy) | **0** | `✓ Compiled successfully in 33.5s` |
| `pnpm --filter @jewelroute/api e2e` against :4000 | **0** | `E2E PASSED — 28 checks` |

### Findings re-tested

| # | Re-test | Result |
|---|---|---|
| M1 | **API, orders and memos:** after check-in with no photo, `resume` = `{canSell:false, nextStep:"UPLOAD_PROOF"}`. `POST /memos` → **409 PROOF_REQUIRED_BEFORE_SALE** and the piece stays AGENT. `POST /orders` → 409. | PASS |
| M1 | **API, return and convert:** I assigned and checked into a Mehta visit with no photo, then acted on the overdue MEMO-00011. Return (implicit visit and explicit `visitId`) → 409 ×2. Convert (implicit and explicit) → 409 ×2. The piece stays SHOP. After the photo, return → 200 and `resume` = `{canSell:true, nextStep:"SELL_OR_COMPLETE"}`. | PASS |
| M1 | **UI:** on the photo stage the visit page shows no sell actions. On the memo tab, 11/11 checkboxes are disabled. The order tab shows 0 quick-add buttons. (`R-M1-memo-no-proof.png`, `R-M1-order-no-proof.png`) | PASS |
| M2 | **Order:** the first `POST /orders` was routed through `route.fetch()` and then fulfilled as a 500. The UI re-sent with the same key and landed on "Order booked". **Exactly 1 order.** (`R-M2-order-booked.png`) | PASS |
| M2 | **Memo, case A:** commit, then a 502. The UI showed "Checking…", re-sent with the same key and landed on the retailer QR. 1 memo, piece SHOP. | PASS |
| M2 | **Memo, case B:** commit, then two 502s. The UI showed "We couldn't confirm the memo. Your pieces are kept in this draft…" and the piece stayed in the draft. Retry → QR. 1 memo. | PASS |
| M2 | **Memo, case C:** as case B, then a **page reload** while unconfirmed. The draft and the warning survived, and Retry → QR, 1 memo. (`R-M2-memo-C…-after-reload.png`) "Custody didn't change" appears nowhere. | PASS |
| M3 | **Determinism:** R4 now creates and approves its own fixture `o3` and compares audit and event counts before and after (`records.test.ts:121-152`), with no time window or "any APPROVED order". It passed 32/32 in 3 of 3 gate runs. | PASS |
| m1 | **Rates with paise:** after setting 10612.50, the toast reads "22K set to ₹10,612.50/g", the dialog shows "(+₹72.50/g)" and the card "₹10,612.50/g +₹72.50 vs previous". The order record reads "Priced at 22K ₹10,612.50/g … Today's 22K rate is ₹10,800/g (+₹187.50)". The API stores 1061250. | PASS |
| m2 | **Rate-as-of per purity:** "At 22K ₹10,612.50/g (rate as of 3:21 pm), 18K ₹8,630/g (rate as of 10:00 am)". (`R-m2-order-review.png`) | PASS |
| m3 | **Line amounts:** they are now pre-GST. ₹3,58,148 + ₹93,673 = Subtotal ₹4,51,821. | PASS |
| m4 | **Approve-race message:** two admin tabs approved the same order. The loser's toast reads "Already approved by Priya Mehta." and the page refetched to show Approved. The API returns 409 "…was already approved by Priya Mehta" with `details {status:"APPROVED", decidedBy, decidedAt}`. The batch race, rerun, still decides each order once, with 1 audit row and 1 event each, and its losers carry the same message. | PASS |
| m5 | **Sidebar freshness:** in a tab opened *before* the rate change and never focused, the sidebar showed ₹10,612.50/g after 26 s of polling alone. | PASS |
| m6 | **Receiver honesty:** a `fail-` endpoint test delivery is FAILED with HTTP 500, and **0** received rows are stored. A forged signature → 401, stored with `signatureOk:false`. An unknown token → 404, with no row stored. `?endpointId=` filters the list. | PASS |
| m6 | **Gating:** I ran a second API on :4199 with `ENABLE_DEMO_RECEIVER=false`; the demo token → **404**. The running dev API (flag unset) answers. The truth table is covered in `api.test.ts:288-293`. | PASS |
| m7 | **Visits columns at 1440:** Status is the 2nd column (right edge 569 px). The last column ends at 1440, and the table `scrollWidth` equals its `clientWidth` (1200/1200). (`R-m7-visits-1440.png`) | PASS |
| — | **Regression:** all API failure cases from section C rerun green, including double check-in, duplicate order and memo, double assignment, tenant isolation, the webhook ladder to DEAD plus manual retry, and the rate change after old orders. | PASS |
| — | **28-step UI scenario spot check:** the full `scenario.js` run, with three contexts and no reloads. | **28/28 PASS** |

**Still open (accepted as minor and not blocking):**
- m8: admin at 390 px.
- m10: the "Last visit" label.
- m9: the server's idempotency fallback still returns `ack:null`, but the field client now reissues the link, which I observed in M2 cases B and C ending on the QR.

The only console errors during re-verification were the 500, 502 and 409 responses I injected or triggered on purpose.

### Final verdict: **APPROVE**

All three majors are fixed and independently reproduced as fixed. Every re-tested minor passes. The gate is green 3 of 3, the e2e passes 28/28, and the 28-step UI flow passes end to end.
