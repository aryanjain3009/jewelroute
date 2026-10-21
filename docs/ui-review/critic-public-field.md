# Independent UI critique: public and field pages

Reviewer: independent critic with fresh context. I did not build these screens and I ignored the builders' self-scores.
Build: merged `main` (f761973), `next start` on :3000, API on :4000, seed data, 22 Oct 2026 (IST).
Method: Playwright Chromium at 390×844 (touch), 768×1024 and 1440×900. I clicked every visible link and button on `/`, `/developers` and `/login`, and ran the real field flow as Rahul: outside the fence, location blocked, check-in inside the fence, arrival photo, an order (which went to approval), a memo, the retailer ack page (pending, confirmed and invalid), then completing the visit.
Screenshots: `/tmp/claude-0/-home-claude/88dfd755-9b6f-51f7-b59f-222ce551b7df/scratchpad/ui/critic/`. Paths below are relative to this folder (`$S/`).

Scale: 9 means a strong startup design team would ship it as is. 10 means Attio or Stripe level.

## Scores

| Page | Hier. | Spacing | Type | Interact. | Density | Consist. | Resp. | Polish | **Overall** |
|---|---|---|---|---|---|---|---|---|---|
| `/` landing (whole page) | 8 | 7 | 8 | 8.5 | 7 | 7.5 | 7.5 | 8 | **8** |
| `/` landing hero (10 target) | 9 | 8.5 | 8 | 8.5 | 8.5 | 7.5 | 7.5 | 8.5 | **8.5** |
| `/developers` | 9 | 9 | 9 | 8 | 9 | 8 | 9 | 8.5 | **8.5** |
| `/login` | 9 | 8 | 9 | 8 | 8 | 8 | 8 | 8.5 | **8.5** |
| `/ack/[token]` pending | 8.5 | 9 | 9 | 8.5 | 8 | 9 | 8.5 | 9 | **8.5** |
| `/ack/[token]` confirmed + invalid | 9.5 | 9.5 | 9.5 | 9 | 9 | 9.5 | 9 | 9.5 | **9.5** |
| `/field/today` (10 target) | 9 | 9 | 8.5 | 8.5 | 8.5 | 8 | 8 | 8.5 | **8.5** |
| `/field/visits` | 8.5 | 9 | 8.5 | 8.5 | 8.5 | 8 | 8 | 8.5 | **8.5** |
| `/field/visits/[id]` active visit, all states (10 target) | 8 | 8.5 | 8.5 | 8.5 | 8.5 | 7.5 | 8 | 8.5 | **8.5** |
| `/field/visits/[id]/sale` order: browse, detail, cart, review, receipt (10 target) | 9 | 9 | 9 | 8.5 | 9 | 8.5 | 8 | 9 | **8.5** |
| `/field/visits/[id]/sale` memo: pick, review, QR/code | 9 | 9 | 9 | 9 | 9 | 8 | 8 | 9 | **9** |
| `/field/catalog` | 8.5 | 9 | 9 | 8.5 | 8 | 8.5 | 7.5 | 8.5 | **8.5** |
| `/field/profile` | 8 | 8.5 | 8.5 | 8.5 | 7.5 | 7.5 | 8 | 8 | **8** |

Only two surfaces reach 9: the memo flow and the confirmed ack receipt. None of the four 10/10 targets is at 10. The gaps are not structural. They come from repeated small rule breaks (gold used as decoration, duplicated status lines, an ALL-CAPS eyebrow, `→` glued to button text) plus a few layout seams.

What already works, so it isn't undone in a fix pass:
- Every public link resolves. All 19 `/developers#…` anchors and all 9 `/#…` anchors exist.
- The mock buttons inside the product previews are `inert` and `aria-hidden`, so they are not dead controls.
- The money formatting is right throughout (`₹18,50,766`, `₹1.54L`).
- The check-in states tell you what happened and what to do next ("211 m … Check-in opens within 100 m", "Location is blocked … then retry").
- Simulated arrival is labelled as simulated everywhere.
- The ack receipt with its perforated edge is excellent.

---

## Public

### `/` landing: 8 overall, hero 8.5 (target 10)
1. **ALL-CAPS eyebrow pill** (`landing-1440-view.png`, `landing-390-view.png`, `landing-768-view.png`, top of the hero). "FIELD SALES OPERATING SYSTEM FOR JEWELRY" breaks DESIGN.md and web.md ("No ALL-CAPS eyebrows"). Make it sentence case, 13px/500, `#6e6f73`, no letter-spacing. Better still, copy Attio and make it a link pill to `/#workflow` with a chevron.
2. **The grey band seams through the product frame** (`landing-1440-full.png` y≈887, `landing-1440-hero-field-agent.png` y≈507, `landing-390-hero-field-agent.png` y≈365). The `#f7f7f7` section background starts halfway down the browser and phone mocks, so a hard horizontal line cuts through the hero product on every tab. Start the band at the top edge of the frame (or behind the tab bar), or fade it in over 120px the way Attio's hero wash does.
3. **The hero preview breaks at 390** (`landing-390-scrolled-full-g00.png`, first column). On the Manager tab, "Overdue on memo" clips to "Overdue on memc", and the mock is a shrunken desktop that cuts off mid-feed. Under `sm`, show a purpose-built mobile crop: the KPI strip as 2×2 with labels that wrap, plus Needs attention, and nothing else.
4. **Tab labels change across widths, and case is inconsistent** (`landing-1440-view.png` vs `landing-390-menu.png`). Desktop says "Field Agent / Sample Custody" and mobile says "Field agent / Custody". The brief names "Manager | Field Agent | Sample Custody", but the rule is sentence case. Pick "Manager · Field agent · Sample custody" and use it at every width.
5. **The Field Agent hero phone overflows** (`landing-1440-hero-field-agent.png`, middle phone). The "Sell and complete" step label runs past its third of the step bar to the card edge, and there is about 100px of empty white between "Acknowledged by QR" and "Complete visit". Shorten the label to "Sell" (or allow two lines) and size the phone to its content.
6. **Dead whitespace in Verified visits** (`landing-1440-sec-visit.png`, left column). Each of the four rows is about 190px tall and holds two lines of text at the top. Shrink them to about 72px, or make them selectors that switch the map state (verified, low accuracy, simulated, refused) so the height is earned.
7. **The Sample custody preview breaks a token mid-word** (`landing-1440-hero-sample-custody.png`, Sample details). "Rajwada Bangle · AJ-BNG-2201" wraps as "AJ-" / "BNG-2201". Put the SKU on its own line, or use `whitespace-nowrap` on the SKU.
8. **The 390 menu has no backdrop** (`landing-390-menu.png`). The dropdown sits over the hero copy, the text bleeds at the panel edge, and the toggle is 36×36px. Use a full-width sheet with a scrim, or at least a white panel to the bottom of the header, and make the toggle 44px.
9. **Minor.** Lazy sections pop in. The manager-ops frame is an empty grey 690px box until it scrolls into view (`landing-1440-full.png` p05). Render the frame chrome eagerly and lazy-load only the images. The 401 console errors on public pages come from the session probe; skip that call when there is no cookie.

### `/developers`: 8.5
1. **The example payloads disagree with the rest of the site** (`developers-1440-event-open.png`). `order.created` shows `"orderId": "clo…"` (an elided id that reads like a bug), `totalPaise: 54321000` for `ORD-2026-00042` (the landing says ₹3,83,604), and `ratePaisePerGram: 1054000` beside a page that quotes ₹10,525. Use one coherent example order everywhere, with a full cuid.
2. **The selected event state is weak** (`developers-1440-event-open.png`). The `order.created` row is selected only by a near-invisible grey fill. Add a 2px ink left rule (or `#eef3fe` plus a blue rule, matching the app's selection), and put "order.created" in the panel title in mono.
3. **Small targets on mobile** (`developers-390-view.png`). The copy buttons and the Success/Error tabs are 28px tall at 390. Make them at least 36px (44px for the copy icon's hit area).

### `/login`: 8.5
1. **`→` glued to button text** (`login-1440-view.png`, "Continue as Rahul →", "Continue as Priya →"). This is banned by DESIGN.md. Drop the arrow, or make the whole card the button with a trailing chevron icon in its own cell, as the 390 layout already does.
2. **The Rahul vs Priya choice weakens below 1280** (`login-768-view.png`, `login-390-view.png`). The phone and laptop previews disappear, leaving two text rows. Put one 56px thumbnail of each product (phone crop, laptop crop) in each row so the choice is visual at every width.
3. **The desktop composition floats** (`login-1440-view.png`). The sign-in form sits vertically centred in an empty white half, while the left column is top-aligned. Top-align the form with the left headline (y≈176), or put the credentials form under the two cards and give the left column the full width.

### `/ack/[token]`: pending 8.5, confirmed 9.5
1. **The retailer can't see the total or the code before confirming** (`ack-pending-390.png`, `ack-pending-1440.png`). At 390 the "Total value ₹1,53,935" row and the six-digit code sit below the sticky Confirm bar. At 1440 the code is cut in half behind it. Move "Total value" into the sticky bar ("Confirm receipt · ₹1,53,935"), and move the code block above the pieces list or into a collapsible line above the bar.
2. **Orphan in the title** (`ack-pending-390.png`). "Confirm you've received 2" / "pieces" breaks badly. Use `text-wrap: balance` on the Newsreader title.
3. **Copy nit.** "Net gold 15.84 g" is the net weight of 18K pieces, not the gold content. Rename it "Net weight".

---

## Field (Rahul, 390 is primary)

### `/field/today`: 8.5 (target 10)
1. **Map markers look like toggle switches** (`field-today-390.png`, `field-today-after-390.png`). Each stop is a black blob plus a number in a white pill. The selected stop shows a white circle (it reads as an unchecked radio), and stop 1 is hidden under the "me" dot. Use DESIGN's numbered marker: a 22px circle with the number inside, ink for next, green for done, grey for planned. Put the label pill only on the focused stop, and offset the "me" dot or draw it under the markers.
2. **Custody is below the fold, and gold is uneven** (`field-today-390-full.png`, `field-today-768.png`). "In your bag" and "Out on memo" sit under the route, and the bag value is gold while the memo value is ink. Both are custody values: make both gold, or both ink with gold only on the bag total. Consider a one-line custody strip under the greeting ("₹21.3L in bag · ₹6.84L on memo · 1 overdue").
3. **"0 m away"** (`field-today-390.png`, next stop). When you are inside the fence, say "You're here" in verified green, not a zero distance.
4. **The toast covers the top bar, and its close button floats** (`visit-completed-390.png`, `visit-photo-uploading-390.png`). The success toast renders at the top over Back and the title, with its ✕ detached at the top-left corner. `components/ui/sonner.tsx` sets `bottom-center` for field, so the field flag is not reaching these routes. Fix the routing so field toasts sit above the bottom bar, and hide the close button on field.

### `/field/visits`: 8.5
1. **Two status vocabularies** (`field-visits-390-full.png`). Today's rows use a dot plus "Planned", and past rows use a green check bubble with no label. Use the same dot plus label ("Completed") everywhere, as web.md asks.
2. **The area truncates too early** (same screenshot, Mehta row). "Chandni Ch…" is cut while "₹12.1L ordered" and "1 memo" fit. Put money and memo on a second meta line, or drop "ordered".
3. **A ring stays after a tap** (`field-visits-upcoming-390.png`). The Upcoming tab keeps a blue focus ring after a pointer click. Use `focus-visible:` instead of `focus:`.

### `/field/visits/[id]` active visit: 8.5 (target 10)
1. **The wrong action dominates** (`visit-active-390.png`, `visit-after-sale-390.png`). The sticky full-width ink "Complete visit" is the loudest element for the whole visit, while "Create order" and "Leave on memo" are quiet tiles. Rahul's next action in the shop is selling. Until something has been recorded, make "Create order" the ink primary in the bottom bar, with "Complete visit" as an outline or secondary. Swap them once an order or memo exists (or after N minutes).
2. **Before check-in, "verified" appears twice** (`visit-planned-390.png`). A green "Location verified, 0 m" panel and "You're inside the zone" above the button say the same thing, and "verified" before check-in overstates the client fix (truth rule). Before check-in, say "You're at Sharma Jewellers · 12 m" (neutral or green), keep one line, and reserve "verified" for the server response after check-in.
3. **Gold used as decoration** (`visit-outside-390.png`, `visit-nogeo-390.png`, `visit-active-390.png`). The geofence ring is gold when you are outside, and the "Leave on memo" tile has a gold diamond icon. Gold is for value only. Make the fence `warn` or ink-3 dashed outside (green inside), and make the memo icon ink-2.
4. **Duplicate shop name and status** (`visit-active-390.png`, `visit-past-mehta-390-full.png`). "Sharma Jewellers" appears as both the top-bar title and the 22px H1. Make the top bar say "Visit · Stop 1" (or hide its title until the H1 scrolls out). In the timeline, "Pending approval" chip plus "Waiting for your manager" box, and "Approved" chip plus "Approved by Priya" box, repeat the same status. Keep the explanatory box and drop the chip.
5. **A heavy blocked state** (`visit-nogeo-390.png`). "Location is blocked" fills a danger-red block. This is not a failure of anything Rahul did. Use the `warn` tone with the same copy, and keep red for outside the fence or refused.

### `/field/visits/[id]/sale`: order 8.5, memo 9 (order target 10)
1. **"1 in your bag" badges on every order card** (`sale-browse-390.png`, `sale-cart-390.png`). In Order mode, the memo-bag count sits top-left on most photos and competes with the order quantity bubble. Show bag counts only in Memo mode, or as a small grey meta line under the price.
2. **The sheet's price disagrees with its breakdown** (`sale-detail-390.png`). The CTA says "Add to order ₹96,483" (incl. GST), while the last breakdown row visible above it says "Unit price before GST ₹93,673". The GST and Total rows are below the bar. Label the CTA amount "incl. GST", or pin "Total ₹96,483 incl. GST" just above the bar.
3. **Placeholders read as real data** (`sale-review-390.png`, `memo-review-390.png`, `visit-complete-drawer-390.png`). "Deliver before Dhanteras. Size 2.6 for the bangles.", "For the Gupta family's wedding viewing on Saturday." and "Booked 2 bangles. Left the Rajwada kada…" look like entered notes. Use short generic placeholders in `#9b9ca0` ("Anything the office should know").
4. **Gold wash on selected memo rows** (`memo-picked-390.png`). Selection is not value. Use the neutral selected fill (`#eef3fe` or `bg-sunken`) with the ink checkbox, and keep gold for the amounts.
5. **The receipt landed scrolled once** (`sale-receipt-390.png`). The hourglass badge was clipped under the top bar on arrival; I saw this once and could not reproduce it. Call `scrollTo(0,0)` when the step changes to done or ack.
6. **Tablet and desktop** (`sale-browse-1440.png`, `field-catalog-1440.png`). The category chips run into the column edge ("Neck…") with no fade, and the 2-column grid shows two products per laptop screen. Add a right-edge fade mask to the chip scroller. Allow 3 columns at ≥ 600px if the field shell stays narrow.

### `/field/catalog`: 8.5
1. **The rate strip doesn't say what the time means** (`field-catalog-390.png`). "1:08 am" alone could be a clock. Write "Set 1:08 am" or "Rate as of 1:08 am, 22 Oct", as the detail sheet does.
2. **The filter row clips with no affordance** (same). "Any 18K 22K | All Bangles Bridal Sets…" runs off the right edge. Add an edge fade, or move purity into a "Purity ▾" select so the category chips get the row.
3. Browse vs sell context is clearly different: there is no add button, and the footer tells you to check in to sell. Keep it.

### `/field/profile`: 8
1. **The bag list dominates the page** (`field-profile-390-full.png`). Eleven full rows push "Open memos" and "Sign out" about 1,200px down. Show the first 4 pieces plus "Show all 11", or move the bag to its own view.
2. **The overdue memo is shown twice** (same). A red alert box ("1 memo overdue…") sits right above the Mehta row, which already says "2 days overdue" in red. Drop the box and keep the row with the red label (one colour on the page).
3. **Gold on a count** (same, "This week"). "Memos open 1" is gold. Counts are ink; gold is for value.

---

## Notes for the fix pass
- The four 10/10 targets each need their top 2–3 items fixed first: hero 1–3, Today 1–2, Active visit 1–3, Sale 1–3.
- Not testable on seed data: very long shop and design names, and ₹ values in the crores on field cards. Add one seed shop with a 40-character name and one ₹1.2Cr order before the next review.
- `scripts/run-local.sh --prod` hung on `createdb` (role `root`, waiting for a password) when Postgres on :5432 needs the `postgres` user from `apps/api/.env`. The servers came up later without my intervention, so I didn't touch it.
