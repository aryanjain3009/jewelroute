# VERIFY-P7 — end-to-end product verification (field + manager)

**VERDICT: REJECT.** No blockers. Every step in the core loop works, and every number in the UI matched the API. The verdict is REJECT because of 2 major defects: the UI promises behaviour it does not deliver (the agent never sees the rejection reason), and the memo-to-sale path skips the credit review that every other order gets.

- Run: 21 Oct 2026, 6:04–6:27 pm IST, tree `14a7a60` (main, clean). Reseeded first via `POST /v1/internal/seed`.
- Servers: production web build on :3000 and API on :4000 (not restarted).
- Driver: Playwright 1.56.1 (Chromium 1194), with separate contexts:
  - Rahul at 390×844 (mobile, touch)
  - the retailer at 390×844 (no login)
  - Priya at 1440×900
- Every step was done by clicking in the UI. The API was called only to cross-check state, using `page.request` with the user's own cookies.
- I made two direct API calls on purpose: an order and a memo before the arrival photo, to prove the server-side block.
- Screenshots: `/tmp/claude-0/-home-claude/88dfd755-9b6f-51f7-b59f-222ce551b7df/scratchpad/p7/` (written below as `p7/<name>.png`).

## Steps

| # | Step (who) | What the UI showed | API cross-check | Result |
|---|---|---|---|---|
| 1 | Login, then Today (Rahul, 390) | 0 of 4 visits done; Sharma is next. Bag ₹21.3L / 11 pieces; on memo ₹6.84L, 1 overdue. "Location blocked" is handled gracefully. No horizontal scroll. `p7/01-rahul-today-390.png` | `/field/today`: progress 0/4, bag 212877411 paise / 11, memos 68375455 / 1 overdue | PASS |
| 2 | Open the Sharma visit | Stop 1, address, map; "On memo here: Nothing", "First visit", "No orders yet"; 11 pieces in the bag. `p7/02-rahul-visit-open-390.png` | visit PLANNED, geofence 100 m, 0 previous orders, 0 memos | PASS |
| 3 | Location → "Simulate arrival (demo)" | Checks in at once. Banner reads "Arrival simulated (demo)", timeline reads "Checked in (simulated)". Nothing on screen claims "verified". `p7/03-rahul-simulated-arrival-390.png` | `verification: SIMULATED`, status CHECKED_IN | PASS |
| 4 | Sale before the photo (optional) | The `/sale` page shows "Add the arrival photo on the visit first." | Direct POST `/v1/orders` and `/v1/memos` → **409 PROOF_REQUIRED_BEFORE_SALE** for both | PASS |
| 5 | Arrival photo (Upload → file chooser, jpg) | Thumbnail renders (naturalWidth 800). "Uploaded, SHA-256 7b5ca669". Actions unlock. `p7/05-rahul-photo-uploaded-390.png` | 1 proof, checksum prefix 7b5ca669, visit ACTIVE | PASS |
| 6 | Workspace → Browse catalog / Create order | 16 designs, rates 22K ₹10,540/g and 18K ₹8,630/g. The Huggies breakdown adds up: 3.50 g × ₹8,630 = ₹30,205; + making ₹4,229; + stones ₹2,400 = ₹36,834; + 3% GST ₹1,105 = **₹37,939**. `p7/07b-rahul-design-sheet-390.png` | `totalWithGstPaise` 3793871 | PASS |
| 7 | Review the small order | "Within credit — confirms right away". Outstanding ₹8,00,000, Limit ₹25,00,000, Available ₹17,00,000, This order ₹37,939, Exposure after ₹8,37,939. `p7/09-rahul-order-review-390.png` | `/visits/:id/credit`: 80000000 / 250000000 / 170000000 / 3793871 / 83793871, `requiresApproval: false` | PASS |
| 8 | Place the order | "Order confirmed", ORD-2026-00039, ₹37,939. `p7/10-rahul-order-placed-390.png` | CONFIRMED, approval.required false | PASS |
| 9 | Sample memo: AJ-S-000123 + AJ-S-000139, due in 5 days | 2 pieces, 40.29 g, ₹4,50,460, due Mon 26 Oct. Ack screen shows the QR, copy link, retailer page and a code input. `p7/14-rahul-memo-review-390.png`, `p7/15-rahul-memo-created-ack-390.png` | MEMO-2026-00013: ACTIVE, due 2026-10-26, 45046037 paise, both pieces now custodian SHOP, ack PENDING | PASS |
| 10 | Retailer ack (QR link in a new context) | Pieces, weights, values, due date, a 6-digit code ("Or read this code to the agent") and "Confirm receipt". After confirming: "Receipt confirmed … 6:09 pm". `p7/16-retailer-ack-page-390.png`, `p7/17-retailer-ack-confirmed-390.png` | ackStatus ACKNOWLEDGED, method QR_CONFIRM | PASS |
| 10b | Agent screen updates after the ack (no reload) | "Custody confirmed … confirmed on their phone" appeared on the next poll. `p7/18-rahul-ack-synced-390.png` | — | PASS |
| 10c | 6-digit code path (extra memo MEMO-2026-00014 at Mehta) | A wrong code gives "That code doesn't match" (422). The correct code gives "code verified by you". `p7/75-rahul-otp-wrong-390.png`, `p7/76-rahul-otp-confirmed-390.png` | ACKNOWLEDGED, method OTP | PASS |
| 11 | Large order: 1× Rajwada Bridal Set (₹16,26,102) | "Needs manager approval · Over credit limit by ₹4.15L · Above ₹10L approval threshold". Shows Outstanding ₹8,37,939, Samples on memo ₹4,50,460, Limit ₹25L, Available ₹12,11,601, Exposure after ₹29,14,501. After sending: "Sent to your manager for approval", with the reasons. `p7/19-rahul-big-order-review-390.png`, `p7/20-rahul-big-order-pending-390.png` | ORD-2026-00040 PENDING_APPROVAL, reasons [CREDIT_LIMIT, ORDER_THRESHOLD], projected 291450128 (29,14,501 − 25,00,000 = 4,14,501 ≈ ₹4.15L) | PASS |
| 12 | Complete the visit | Summary sheet: 2 orders, 1 memo. Returns to Today: "1 of 4 completed", "Done 6:10 pm". Bag ₹16.8L / 9; memo ₹11.3L. `p7/23-rahul-after-complete-390.png` | COMPLETED, summary saved, bag 9 / 167831374 | PASS |
| 13 | Priya, Home (1440) | Orders today ₹41L (5); visits 2/10; samples outside ₹19.2L (6); overdue ₹6.84L; pending ₹32.8L (3). Needs attention (13) includes ORD-00040 and "Simulated GPS check-in at Sharma … location not verified". Map, agent rail and check-ins table (Rahul: "Simulated") all present. The activity feed has all 9 new Rahul events, with the photo thumbnail and tags. `p7/30-priya-home-1440.png`, `p7/31-priya-home-map-activity-1440.png` | `/admin/dashboard` metrics equal the UI exactly (409814515; 2/10; 191775294 / 6; 68375455; 328310852 / 3) | PASS (see minor m3/m4) |
| 14 | Agents → Rahul → Activity | 1/4 visits, bag 9 · ₹16.8L, memos 2 · ₹11.3L · 1 overdue. Activity (32) starts with the visit completion. Orders tab (5) matches the API list. `p7/34-priya-agent-rahul-activity-1440.png` | `/admin/agents` and `/admin/activity?agentId=` → 32 items, same order | PASS |
| 15 | Shops → Sharma, Overview | Outstanding ₹8,37,939 (incl. ₹8L opening), Limit ₹25,00,000, Available ₹12,11,601, memo ₹4,50,460 · 1 memo, samples 2 · ₹4,50,460, last visit today 6:10 pm · Rahul. `p7/36-priya-shop-sharma-overview-1440.png` | `credit`: 83793871 / 250000000 / 121160092 / 45046037 | PASS (minor m5) |
| 16 | Sharma tabs: Visits / Orders / Memos / Activity | 1 visit (Simulated); 2 orders (Pending, Confirmed); MEMO-00013 2 of 2 out; activity has every event. `p7/37-priya-shop-sharma-*.png` | Matches the shop record arrays | PASS |
| 17 | Order record ORD-00039 | Credit check at booking: ₹8,00,000 / ₹25,00,000 / ₹17,00,000 / ₹37,939 / ₹8,37,939. Line math, frozen rate 18K ₹8,630. `p7/38-priya-order-00039-1440.png` | `approval.position` identical | PASS (title: minor m1) |
| 18 | Memo record MEMO-00013 | Value ₹4,50,460, due 26 Oct (in 5 days), "Acknowledged: By Sharma Jewellers via QR", custody timeline with event ids. `p7/39-priya-memo-00013-1440.png` | Matches | PASS (title: minor m1) |
| 19 | Samples → AJ-S-000123 | "Where it is now": Sharma Jewellers, Karol Bagh · MEMO-2026-00013 · due Mon 26 Oct · "Acknowledged by Sharma Jewellers via QR … handed over by Rahul Verma". Ledger #1 Vault → #2 Rahul → #3 Sharma, with "Visit at Sharma Jewellers", the proof thumbnail (**naturalWidth 800**) and evt ids. `p7/41-priya-sample-AJ-S-000123-1440.png` | History seq 1..3 INTAKE / ISSUE_TO_AGENT / MEMO_HANDOVER. Ledger evt `…CPC160` = webhook eventId `evt_01M5F7JBJ720XQ39ME2ECPC160` | PASS |
| 20 | Proof photo on the visit record | Photo renders (naturalWidth 800). File JPEG, SHA-256 shown. Banner: "Simulated check-in … Treat it as unverified." `p7/42-priya-visit-record-1440.png` | proofs[0] url / checksum match; verification SIMULATED | PASS (minor m7) |
| 21 | Approvals panel: Jain ORD-00038 and Royal Gems ORD-00037 | Jain: Outstanding ₹13,50,000, Limit ₹15,00,000, Available ₹1,50,000, Order ₹2,78,714, Projected ₹16,28,714; "Over credit limit by ₹1.29L". Royal: ₹2,00,000 / ₹18,00,000 / ₹16,00,000 / ₹13,78,292 / ₹15,78,292; "Above ₹10L approval threshold". `p7/44-priya-approval-ORD-2026-00038-1440.png`, `p7/44-priya-approval-ORD-2026-00037-1440.png` | Frozen `approval.position` and live `/admin/shops/:id/credit` agree to the paisa | PASS |
| 22 | Reject Jain (reason) / approve Royal | The reject dialog asks for a reason. Jain shows "Rejected · Priya 6:15 pm" plus the reason; Royal shows Approved and "Mark as settled". `p7/45-priya-reject-dialog-1440.png`, `p7/46-priya-jain-rejected-1440.png`, `p7/48-priya-royal-approved-1440.png` | REJECTED (reason stored) / APPROVED, decidedBy Priya | PASS |
| 23 | Approve Rahul's ORD-00040 | The panel includes "+ ₹4.5L samples on memo", Projected ₹29,14,501. After approval: Home pending "₹0 · All decided", orders today ₹38.2L (4, rejected excluded), Sharma credit ₹24,64,041 outstanding with "₹0 · over by ₹4.15L". Rahul's visit shows "Approved". `p7/49-…`, `p7/50-priya-home-after-decisions-1440.png`, `p7/51-…`, `p7/52-rahul-visit-after-approval-390.png` | dashboard pending 0; shop credit 246404091 / overLimit true | PASS |
| 24 | Activity after the decisions | approved ×2 and rejected (with reason) at the top of Home | `/admin/activity` same 3 events | PASS |
| 25 | Integrations | 14 deliveries, all 200 / Delivered (1/7): checked_in, proof_uploaded, order.created ×2, order.confirmed, sample.custody_changed, memo.created, memo.acknowledged, order.pending_approval, visit.completed, order.rejected, order.approved ×2. The inspector shows headers, signature, payload JSON, the attempt log and receiver `signatureOk:true`. `p7/53-priya-integrations-1440.png`, `p7/54-priya-delivery-inspector-1440.png` | `/webhooks/deliveries` same 14 events / statuses; payload identical | PASS |
| 26 | Extra: convert a memo piece to a sale that needs approval | The admin memo has no convert action. Sharma's visit was already completed, so its memo could not be sold today: same-day re-assign is blocked ("already on this route") and tomorrow's visit cannot be checked in (m2). **Used Rahul's MEMO-2026-00011 at Mehta instead**: Priya assigned Rahul → Mehta today (UI), and **lowered the approval threshold to ₹2L in Settings → Approvals** (the only UI lever; Mehta's credit cannot trip). Rahul: simulate → photo → Sell → AJ-S-000131 → "Book order for 1 piece". Result: ORD-2026-00041 **Pending approval**, ₹5,50,339. `p7/65-rahul-sell-selected-390.png`, `p7/66-rahul-converted-result-390.png` | ORD-00041 PENDING_APPROVAL [ORDER_THRESHOLD]; AJ-S-000131 SOLD; memo PARTIALLY_RETURNED | PASS (major M2) |
| 27 | Priya rejects the converted order | Home picks it up (pending ₹5.5L). The reject dialog **warns**: "Rejecting returns 1 piece to MEMO-2026-00011 at Mehta Jewellers — they go back on memo, not to the vault." `p7/68-priya-reject-converted-warning-1440.png` | — | PASS |
| 28 | After the rejection: sample, memo, ledger | AJ-S-000131 "Where it is now": Mehta Jewellers · MEMO-2026-00011 · 2 days overdue. Stepper: … Mehta → Converted ORD-00041 → Mehta (now). Ledger #4 "Sold from memo", #5 "Sale rejected". Memo: Overdue, 2 of 2 out, ₹6,83,755. `p7/70-priya-sample-AJ-S-000131-after-reject-1440.png`, `p7/71-priya-memo-00011-after-reject-1440.png` | Order REJECTED; memo ACTIVE / OVERDUE, both items OUT; piece custodian SHOP Mehta; history seq 4 CONVERTED_TO_SALE, seq 5 **SALE_REJECTED**; webhooks memo.converted, order.rejected, 2× custody_changed all 200 | PASS |
| 29 | Rahul's screen after the rejection, no reload | Still "Pending approval" and only AJ-S-000148 on memo after 42 s and a synthetic focus event. It updated only on a window `visibilitychange`. Then it shows "Rejected" with **no reason**. `p7/72-rahul-mehta-after-reject-390.png`, `p7/73-rahul-mehta-after-focus-390.png` | API had REJECTED + rejectionReason | FAIL (M1, m11) |
| 30 | Cleanup | Mehta visit completed via the UI; threshold restored to ₹10,00,000 via the UI | settings 100000000 | — |
| 31 | Layout / images / console sweep | Field pages at 390 and admin pages at 1440: `scrollWidth == innerWidth` everywhere; 0 broken images on all record pages. List tables scroll inside their container (m6). | — | PASS (m6, m8) |

Network: no unexpected 4xx/5xx. The ones seen were all expected:
- 401 then auto-refresh after the 15-min access token expired (the pages rendered)
- 422 from my deliberately wrong OTP
- 409 from the future-visit check-in (m2)
- the two deliberate 409s in step 4

"₹0" appears only for real zeros (pending approvals ₹0 · All decided; Sharma available credit ₹0 · over by ₹4.15L). Unknowns render as "No value" or "—".

## Defects (most severe first)

### Blocker
None.

### Major
**M1. The agent never sees the rejection reason, although the admin UI says they will.**
- Repro: reject any pending order with a reason, then open the agent's visit (`/field/visits/:id`). The order row shows "Rejected" and nothing else.
- The reject dialog says "Rahul Verma sees the reason in the field app" (also "Kavya Nair sees…" for Jain).
- Evidence: `rejectionReason` is rendered only in `apps/web/src/app/admin/orders/[id]/page.tsx` (lines 95, 205, 298); no field component references it.
- Screenshots: `p7/45-priya-reject-dialog-1440.png` vs `p7/73-rahul-mehta-after-focus-390.png`.

**M2. The memo-to-sale path books with no price, no credit position and no approval preview, and the result sheet hides the reason.**
- Repro: visit → Samples at this shop → Sell → pick a piece. The sheet says only "The order total is set by the server at today's rate when you book." There is no total, no Outstanding/Limit/Available/Projected, and no "Needs manager approval".
- After booking, the sheet shows "Pending approval" with no reason. The normal order review shows all of this and "Above ₹10L approval threshold".
- So the agent commits a sale that un-memos the piece without seeing the price or that it needs approval. Compare `p7/19-rahul-big-order-review-390.png` with `p7/65-rahul-sell-selected-390.png` and `p7/66-rahul-converted-result-390.png`.

### Minor
**m1. Title/heading mismatch.**
- `document.title` is "Home · JewelRoute" on `/admin/orders/:id` (h1 ORD-…), `/admin/memos/:id` (h1 MEMO-…), `/admin/samples/:id` (h1 AJ-S-…) and `/admin/visits` (h1 Visits). This happens both on direct load and after client navigation.
- Screenshots: `p7/38-priya-order-00039-1440.png`, `p7/39-…`, `p7/41-…`.

**m2. "Simulate arrival (demo)" is enabled on a future visit.**
- On tomorrow's visit "Check in" is disabled ("Check-in opens on the day of the visit"), but the simulate button stays active.
- Tapping it gives 409 and a toast "This visit is not planned for today".
- Screenshot: `p7/59-rahul-simulate-future-visit-390.png`.

**m3. Needs-attention ages are wrong and times use 24-hour format.**
- Missed visits planned at 14:30 / 16:30 today show "18 h". The API `at` is midnight IST of the planned date (`2026-10-20T18:30Z`), not the planned time.
- The overdue memo shows "3 days" next to "2d late".
- Rows say "Planned 21 Oct 14:30" against the design rule "2:30 pm".
- Screenshot: `p7/30-priya-home-1440.png`.

**m4. Missed status disagrees across screens.**
- Home lists "Rahul Verma missed Gupta Gold House".
- At the same moment, the field Today and the Home agent rail show Gupta as "Next · Open visit", and the map draws it as Planned. The legend has "Missed", but no red markers appear even with 7 missed visits.
- Screenshots: `p7/31-…`, `p7/23-rahul-after-complete-390.png`.

**m5. Sharma Highlights says "Outstanding ₹8.38L — 2 open orders".**
- Only the CONFIRMED order is counted in outstanding; the PENDING one is not.
- Also "Upcoming visit: No value" vs "Not planned" on the same page.
- Screenshot: `p7/36-priya-shop-sharma-overview-1440.png`.

**m6. At 1440 the Samples table clips.**
- The table is 1384 px inside a 1200 px container: the Status column cuts "due 2…" and "Last moved" is off-screen.
- Orders, Memos and Visits tables also overflow by 30–50 px.
- Screenshot: `p7/78-priya-samples-list-1440.png`.

**m7. Simulated check-ins show measured-looking figures.**
- "0 m", "Accuracy ±5 m", "Server-checked at 6:05 pm" and "0 m inside fence" appear next to the Simulated label.
- The SALE_REJECTED ledger row (done by Priya in the office) carries the visit's GPS, "Simulated location" and Proof context.
- It is labelled simulated throughout and never "verified", but "Server-checked" reads like verification.
- Screenshots: `p7/42-…`, `p7/70-…`.

**m8. Console warning on every map page.**
- "Expected value to be of type number, but found null instead." appears 2–3× per page with a map: field visit, admin visit, agent record.
- No errors besides the expected network ones.

**m9. The retailer ack page does not refresh after an OTP ack.**
- It keeps showing the code and "Confirm receipt". Tapping is idempotent (it shows the original 6:24 pm).
- Screenshot: `p7/77-retailer-page-after-otp-390.png`.

**m10. No UI path to act on a shop's memo once that day's visit is completed.**
- Same-day re-assign is blocked and the admin memo has no convert or return action. This is why the extra scenario had to use Mehta.

**m11. The field visit page does not poll while an order is pending approval.**
- It refreshes only on a real tab/app `visibilitychange`. A decision does not reach an agent who keeps the screen open.
- This matches the stated design ("Home 10 s, deliveries 5 s; everything refetches on focus"), but it contradicts the order-placed sheet: "the decision shows on this visit".
- Screenshot: `p7/72-rahul-mehta-after-reject-390.png`.

## Not checked
- Real GPS check-in (no location in headless; only the simulated path was used).
- Settle and cancel actions.
- Webhook retry or dead-letter paths.
- Admin at 390 px.

## State left behind
- The DB contains this run's data: ORD-00039 to ORD-00041, MEMO-00013 and MEMO-00014.
- Rahul has a planned Sharma visit on 22 Oct and a completed Mehta visit today.
- The threshold is restored to ₹10L.
- Reseed to reset.

## Re-verification (round 2)

**VERDICT: REJECT.** All 13 round-1 defects (M1, M2, m1–m11) now PASS. The regression run of the whole Rahul → Priya flow is clean: every number matched the API, there were no unexpected 4xx/5xx, no console errors and no layout breaks. It is still REJECT because of one new major defect, N1: the memo's custody timeline attributes a sold piece to the wrong order. The fix is small (see N1).

- Run: 21 Oct 2026, 7:08–7:35 pm IST. Code under test: `831d3d2`, which carries the fix commits `b164665`, `67204d2`, `cd0467d` and `831d3d2`. HEAD `19093ce` adds docs only.
- Reseeded first via `POST /v1/internal/seed` (200).
- Servers: :3000 and :4000 as handed over, not restarted.
- Driver: Playwright 1.56.1 with Chromium from `/opt/pw-browsers`, in separate contexts, with timezone Asia/Kolkata:
  - Rahul at 390×844 (iPhone 13 profile)
  - the retailer at 390×844 (no login)
  - Priya at 1440×900
- Everything was done by clicking in the UI. The API was used only to cross-check, through `page.request` with each user's cookies.
- Map tiles and style loaded, so the m8 check is real.
- Screenshots: `/tmp/claude-0/-home-claude/88dfd755-9b6f-51f7-b59f-222ce551b7df/scratchpad/p7re/` (written below as `p7re/<name>.png`).

### Round-1 defects

| Defect | Repro this round | Evidence (UI ↔ API) | Result |
|---|---|---|---|
| **M1** Agent never sees the rejection reason | Rahul kept the Sharma visit open. Priya rejected the memo-converted ORD-2026-00042 from its record with the reason "Retailer must clear the October dues before buying the Kada". | The dialog now says "Rahul Verma sees the reason, your name and the time … (an open visit updates within 10 seconds)". With no reload, Rahul's order row showed "Rejected by Priya Mehta · 7:14 pm, 21 Oct / Reason: … / The pieces went back on the memo at the shop." API: REJECTED, same `rejectionReason`, decidedBy Priya Mehta. `p7re/M1-reject-dialog-1440.png`, `p7re/M1-field-rejection-reason-viewport-390.png` | PASS |
| **M2** Memo sale had no price, credit or approval preview | Visit → Samples at this shop → Sell. First AJ-S-000139 (₹93,197). Then, with the threshold lowered to ₹2L through Settings, AJ-S-000123. | **139:** lines, GST and total ₹95,993; "Within credit — confirms right away"; Outstanding ₹8,37,939, Samples on memo ₹4,74,502 (chosen piece excluded), Available ₹11,87,560, This sale ₹95,993, Projected ₹14,08,434. All equal `convert-preview` (9599316 / 83793871 / 47450168 / 118755961 / 140843355). Booked as ORD-00041 CONFIRMED. **123:** "Needs manager approval · Above ₹2L approval threshold". The button reads "Send 1 piece for approval ₹3,67,981". The outcome shows the reason. API: ORD-00042 PENDING_APPROVAL [ORDER_THRESHOLD], projected 141915144 = ₹14,19,151 shown. `p7re/M2-sell-preview-390.png`, `p7re/M2-sell-preview-approval-credit-390.png`, `p7re/M2-sell-outcome-pending-390.png` | PASS |
| m1 Title/heading mismatch | Opened each record by client navigation, then reloaded it. | `ORD-2026-00039 · JewelRoute`, `MEMO-2026-00013 · JewelRoute`, `AJ-S-000123 · Rajwada Kada · JewelRoute`, `Visits · JewelRoute`, `Visit · Sharma Jewellers · JewelRoute`, `Rahul Verma · …`, `Sharma Jewellers · …`. The same titles appear after reload. | PASS |
| m2 Simulate enabled on a future visit | Priya assigned Sharma → Rahul for 22 Oct (shop record dialog). Rahul opened it. | The simulate button is disabled with "Simulated arrival opens on the day of the visit, like check-in (planned for Thu, 22 Oct)". Check in is disabled too. No 409 fired. `p7re/m2-future-visit-390.png` | PASS |
| m3 Attention ages and 24-hour times | Priya Home at 7:16 pm | "Planned 21 Oct, 4:30 pm … 3 h", "12:00 pm … 7 h". The overdue memo reads "due 19 Oct (2d late) … 2 days". Kavya's missed visit on 20 Oct reads "1 day". `p7re/30-priya-home-1440.png` | PASS |
| m4 Missed status disagreed across screens | Home vs field Today vs map | PLANNED-late visits now read "has not checked in … still planned". "missed" appears only for the stored MISSED visit. The map legend shows In visit / Done / Planned only, since nothing is missed today. Field Today still shows Gupta as Next, which is consistent. | PASS |
| m5 Sharma "Outstanding — 2 open orders" | Sharma Overview | "Outstanding ₹25.6L — 3 unsettled orders + ₹8L opening" (00039 + 00040 approved + 00041 = ₹17,60,034 + ₹8L). API `outstandingPaise` 256003407. The pending/rejected order is not counted. Shops with no plan say "Upcoming visit: Not planned" (Sethi, Royal, Jain). `p7re/36-priya-shop-sharma-overview-1440.png` | PASS |
| m6 Tables clip at 1440 | Samples, Orders, Memos and Visits lists | Every table is 1200 px wide in a 1200 px container (`scrollWidth == clientWidth`). No header lies past the right edge. Status and "Last moved" are fully visible. Long names truncate with an ellipsis. `p7re/m6-samples-list-1440.png` | PASS |
| m7 Simulated check-ins showed measured-looking figures | Admin visit record, check-ins table, sample ledger | Visit record: "GPS distance: Simulated location (demo) · not verified", "Accuracy: Not measured", "Distance from shop: Not measured", "Entered for the demo, not measured". No "Server-checked" and no "0 m". Check-ins table: distance "—" plus "Simulated". The ledger row #5 "Sale rejected" carries only "Sale was booked on the visit at Sharma Jewellers", with no GPS or proof. `p7re/42-priya-visit-record-1440.png`, `p7re/41b-priya-sample-AJ-S-000123-full-1440.png` | PASS |
| m8 Map console warning | Every map page: field visit, admin Home, agent record, visit record | 0 occurrences of "Expected value to be of type number" across the run. The only console output was Chromium's own software-WebGL notices (environment) and the deliberate OTP 422. | PASS |
| m9 Retailer page stale after an OTP ack | Second memo, MEMO-2026-00014 (AJ-S-000136). The retailer page was open in its own context. Rahul typed a wrong code, then the code read from that page. | Wrong code → "That code doesn't match" (422, deliberate). Right code → "code verified by you". With no reload, the retailer page switched to "Receipt confirmed … 7:12 pm" (the 5 s poll). API: ACKNOWLEDGED / OTP. `p7re/75-…`, `p7re/76-…`, `p7re/77-retailer-page-after-otp-390.png` | PASS |
| m10 No path to act on memo pieces after the visit closes | Completed the Sharma visit, then reopened it | "2 pieces still on memo at Sharma Jewellers … Start a visit at Sharma Jewellers to sell or return memo pieces." With no visit planned it says "isn't on your route again yet. Ask your manager to add it". After Priya assigned 22 Oct, it shows "Open the visit on Thu, 22 Oct", which links to that visit. That link appeared after a reload; a synthetic `focus` event did not refetch. `p7re/m10-closed-visit-no-next-390.png`, `p7re/m10-closed-visit-memo-390.png` | PASS |
| m11 No polling while an order is pending | Same open Sharma visit as M1, with no reload and no focus or visibility events | The rejection with its reason appeared **3.8 s** after Priya's click. The approval of ORD-00040 ("Approved by Priya Mehta · 7:14 pm") appeared **4.5 s** after hers. The memo pieces list updated too (₹4.75L out, AJ-S-000123 back on MEMO-00013). | PASS |

### Regression run (compact)

| Step | Result | UI ↔ API |
|---|---|---|
| Rahul Today (390) | 0 of 4, Sharma next, bag ₹21.3L / 11, memo ₹6.84L · 1 overdue, no horizontal scroll. `p7re/01-rahul-today-390.png` | `/field/today` 212877411 paise, 4 planned |
| Sharma → Simulate arrival | "Simulated location (demo) · not verified"; timeline "Checked in (simulated)". Nothing says verified. `p7re/03-…` | SIMULATED, CHECKED_IN, `canSell` false before the photo |
| Arrival photo (Upload, file chooser) | Thumbnail naturalWidth 1200; "Uploaded, SHA-256 cc23231c"; actions unlocked. `p7re/05-…` | ACTIVE, 1 proof cc23231c, `canSell` true |
| Normal order: Huggies | "Within credit": ₹8,00,000 / ₹25,00,000 / ₹17,00,000 / ₹37,939 / ₹8,37,939. Placed → "Order confirmed", ORD-2026-00039. `p7re/09-…`, `p7re/10-…` | CONFIRMED 3793871 |
| Big order: Rajwada Bridal Set | "Needs manager approval · Above ₹10L approval threshold". Exposure after ₹24,64,041. Sent → "Sent to your manager for approval" with the reason. `p7re/19-…`, `p7re/20-…` | ORD-00040 PENDING_APPROVAL [ORDER_THRESHOLD], projected 246404091 |
| Memo AJ-S-000123 + AJ-S-000139, 5 days | ₹4,50,460, due Mon 26 Oct. QR, link and code input shown. `p7re/14-…`, `p7re/15-…` | MEMO-2026-00013 ACTIVE 45046037, due 2026-10-26 |
| Retailer ack via link | Pieces, values, code and Confirm → "Receipt confirmed … 7:12 pm". The agent screen showed "Custody confirmed … confirmed on their phone" without a reload. `p7re/16-…`, `p7re/17-…`, `p7re/18-…` | ACKNOWLEDGED / QR_CONFIRM |
| Ack via 6-digit code (MEMO-00014) | See m9 | ACKNOWLEDGED / OTP |
| Complete the visit | Sheet: 4 orders, 2 memos. Today: 1 of 4, "Done 7:15 pm", bag ₹15.6L / 8, memo ₹11.6L. `p7re/23-…` | bag 156107519 / 8; Rahul open memos 115825623 / 3 |
| Priya Home | Orders today ₹39.2L (5), visits 2/10, samples outside ₹19.4L (6), overdue ₹6.84L, pending ₹0 "All decided" (a real zero). Attention and activity carry every new event, with the reasons. | `/admin/dashboard` 391542443 / 5; 2/10; 194179425 / 6; 68375455; 0 |
| Agents → Rahul | 1/4, bag 8 · ₹15.6L, memos 3 · ₹11.6L · 1 overdue, orders today ₹17.6L "3 orders · excl. rejected". Memos, Orders and Activity tabs all render. `p7re/34-…` | `/admin/agents` ordersToday 176003407 / 3; activity 43 items |
| Sharma record: Overview / Visits / Orders / Memos / Activity | Credit: Outstanding ₹25,60,034, Limit ₹25,00,000, Available "₹0 · over by ₹5.35L", memo ₹4,74,502 · 2. The tabs list 2 visits (one Simulated), 4 orders and 2 memos. `p7re/36-…`, `p7re/37-…` | credit 256003407 / 250000000 / 0 / 47450168; overLimit true |
| Jain reject / Royal approve | Jain: ₹13,50,000 / ₹15,00,000 / ₹1,50,000 / ₹2,78,714 / ₹16,28,714, "Over credit limit by ₹1.29L"; rejected with a reason. Royal: "Above ₹10L"; approved, then "Unpaid · Decided by Priya Mehta". `p7re/44-…`, `p7re/46-…`, `p7re/48-…` | REJECTED + reason / APPROVED, decidedBy Priya |
| Order record ORD-00039 | Credit check at booking and the frozen 18K ₹8,630 match the field review. `p7re/38-…` | — |
| Memo record MEMO-00013 | Status, ack via QR, pieces (139 Converted, 123 Out), custody timeline. **N1 below.** `p7re/39-…` | `custody` events seq 4 → ORD-00041 (139) and ORD-00042 (123) |
| Sample AJ-S-000123 | "Where it is now": Sharma Jewellers, Karol Bagh · since 7:14 pm · MEMO-2026-00013 · due Mon 26 Oct · acknowledged via QR, handed over by Rahul Verma. Ledger: #1 stock → #2 Rahul → #3 Sharma (Proof) → #4 Sold, ORD-00042 → #5 Sale rejected → Sharma. Proof thumbnail naturalWidth **1200**. `p7re/41-…`, `p7re/41b-…` | — |
| Integrations | 27 deliveries, all 200 / Delivered (1/7). The inspector shows headers, signature, payload and receiver `signatureOk:true`. `p7re/53-…`, `p7re/54-…` | `/admin/webhooks/deliveries`: 27 SUCCEEDED |
| Layout / images sweep | Field Today, Visits, Catalog, Profile, visit, sale and retailer pages: `scrollWidth == 390`. Admin Home, lists and records: `scrollWidth == 1440`. 0 broken images. | — |

Network: the only 4xx was the deliberate 422 from the wrong OTP. No 5xx.

### New defects (most severe first)

**N1. Major. The memo custody timeline credits a sold piece to the wrong order.**
- Two separate memo sales in one visit were merged into a single row: "Rahul Verma recorded 2 pieces as sold … Sold from memo · ORD-2026-00041 · AJ-S-000139 AJ-S-000123".
- AJ-S-000123 was sold on **ORD-2026-00042**, and that sale was later rejected. The API `custody` array has seq 4 → ORD-00041 for 139 and seq 4 → ORD-00042 for 123, 25 s apart.
- Cause: `group()` in `apps/web/src/components/admin-v2/sales/custody-timeline.tsx:33` builds its key without the order, and line 118 shows the first event's order for the whole row.
- This is a custody record that states something false, against the rule "the UI never invents state".
- Fix: add `e.order?.number` to the group key.
- The piece-level ledger on the sample page is correct.
- Screenshot: `p7re/N1-memo-00013-custody-merged-orders-1440.png`.

**N2. Minor. Raw enum on the admin visit record.**
- "Samples moved" shows `SALE_REJECTED`, because the `REASON` map at `visit-record.tsx:307` has no entry for it.
- Screenshot: `p7re/N2-visit-record-raw-enum-1440.png`.

**N3. Minor. A memo with a piece sold and none returned reads "Partly returned".**
- This shows on the field pill, the admin memo record, the shop memos tab and the agent memos tab.
- The cause is the stored status `PARTIALLY_RETURNED`. The label tells the agent something that did not happen.
- This was already present in round 1 (step 26).

**N4. Minor. "Last order" on the field's "Before you go in" shows a rejected order with no status.**
- It shows "ORD-2026-00042, ₹3.68L", which was rejected.
- Screenshot: `p7re/m2-future-visit-390.png`.

**N5. Minor (gate flake). API test `7b` failed once.**
- It failed in the first `pnpm verify`: "500 !== 401" at `apps/api/test/api.test.ts:276` (bad-signature post to the demo receiver).
- The API suite passed 50/50 on the rerun and on a second full `pnpm verify`.
- Cause not found. The log is kept at `scratchpad/r2/verify1-api-test.log`.

**Observation, not ranked.** The `visit.completed` webhook carries `orderCount: 4, ordersValuePaise: 212801509`, which includes the rejected ORD-00042. The visit record says "₹17.6L · 3 orders · excl. rejected". Check whether the contract intends this.

### Gates
- `pnpm verify` run 1: **exit 1**. Everything passed except api test, 49/50 (7b, N5): shared 14/14, harness 102/102, typechecks and lint.
- `pnpm --filter @jewelroute/api test` rerun: exit 0, 50/50.
- `pnpm verify` run 2: **exit 0**. All green: api 50/50, shared 14/14, harness 102/102.

### Not checked
- Real GPS check-in (headless has no location).
- Settle and cancel.
- Webhook retry or dead-letter paths.
- Admin at 390 px.
- Home live-updating while a decision happens; this was checked only after navigation.

### State left behind
- The demo DB was reseeded after this run, so it is clean for handover.
- The approval threshold was restored to ₹10,00,000 through the UI before the reseed.

## Fixes after round 2

| Defect | Fix |
|---|---|
| N1 (major) — memo timeline merged two sales under one order | `custody-timeline.tsx` groups custody rows by order number as well, so each sale is its own row labelled with its own order |
| N2 — raw `SALE_REJECTED` on the visit record | label "Sale rejected" added to the visit record's reason map |
| N3 — "Partly returned" when pieces were sold, not returned | `PARTIALLY_RETURNED` is now labelled "Partly closed" (covers returned and sold); the enum is unchanged |
| N4 — "Last order" hid a rejected/pending status | the field workspace shows the order's status pill unless it is Confirmed or Approved |
| N5 — test 7b flake (500 vs 401, not reproducible: 5/5 isolated runs pass) | the test harness now waits for the previous API process to exit (SIGKILL after 5 s) before the next file boots on the same port; the server's stderr stays visible so a recurrence shows its cause |

Evidence: `pnpm verify` exit 0 (shared 14/14, api 50/50, harness 102/102, web typecheck + lint); `pnpm --filter @jewelroute/web build` exit 0; admin smoke on the rebuilt server: every list page titled correctly, no console errors, no 5xx.
