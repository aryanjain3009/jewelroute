# Admin UI: independent critic review

Reviewer: an independent critic with fresh context who did not build these screens. The builder's self-scores in `admin.md` were not used.
Build: merged `wt-crit` (`run-local.sh --prod`), web on :3310 and API on :4310, seed data, logged in as admin@aurum.test. Date: 22 Oct 2026, about 1:15 am IST.
Widths: 1440×900 (primary), 768×1024 and 390×844. Screenshots are in
`/tmp/claude-0/-home-claude/88dfd755-9b6f-51f7-b59f-222ce551b7df/scratchpad/ui/critic-admin/` (`<page>-<width>.png`, `-s1/-s2` = scrolled).
States I created: a failing webhook endpoint (`https://httpbin.org/status/500`, then Send test event), 2 selected shop rows, a search with no results, a sort change, and the dialogs for Assign visit, Set rate, Add endpoint and Edit shop. I reseeded afterwards.

Scale: 9 means a strong startup design team would ship it as is. 10 means Attio level.
Columns: H hierarchy · S spacing · T typography · I interaction · D density · C consistency · R responsiveness · P polish.

## Scores

| Page | H | S | T | I | D | C | R | P | Overall |
|---|---|---|---|---|---|---|---|---|---|
| **Home** (target 10) | 9 | 8.5 | 9 | 9 | 9 | 7.5 | 8.5 | 8.5 | **8.5** |
| Visits list | 8.5 | 8.5 | 9 | 8.5 | 8 | 8 | 8 | 8 | **8** |
| Visit record | 8 | 8.5 | 9 | 8.5 | 7 | 8 | 8.5 | 8 | **8** |
| Agents list | 8.5 | 8.5 | 9 | 8.5 | 8.5 | 8.5 | 8 | 8.5 | **8.5** |
| Agent record | 8.5 | 8.5 | 9 | 8.5 | 8.5 | 8 | 8.5 | 8.5 | **8.5** |
| Shops list | 9 | 8.5 | 9 | 9 | 9 | 8 | 8 | 8.5 | **8.5** |
| **Shop record**, 5 tabs (target 10) | 8.5 | 8.5 | 9 | 9 | 7.5 | 8 | 8.5 | 8.5 | **8.5** |
| Orders list | 9 | 9 | 9 | 9 | 9 | 9 | 8 | 8.5 | **9** |
| Order record (pending/confirmed) | 9 | 8.5 | 9 | 9 | 8 | 8 | 8.5 | 8.5 | **8.5** |
| Memos list | 8.5 | 8.5 | 9 | 8.5 | 8.5 | 8 | 8 | 7.5 | **8** |
| Memo record | 9 | 9 | 9 | 9 | 9 | 8.5 | 8.5 | 9 | **9** |
| Samples list | 9 | 9 | 9 | 9 | 9.5 | 9 | 8 | 9 | **9** |
| **Sample record** (target 10) | 9.5 | 9 | 9 | 8.5 | 8.5 | 9 | 8.5 | 9 | **9** |
| Catalog | 9 | 9 | 9 | 8.5 | 9 | 8.5 | 8 | 8.5 | **8.5** |
| Integrations | 9 | 8.5 | 9 | 9 | 9 | 8 | 7.5 | 8.5 | **8.5** |
| Settings (Gold rate · Approvals · Workspace) | 8.5 | 8.5 | 9 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | **8.5** |
| Side-sheet previews | 9 | 9 | 9 | 9.5 | 9 | 8.5 | n/a | 9 | **9** |
| ⌘K | 9 | 9 | 9 | 8.5 | 8 | 9 | n/a | 8.5 | **8.5** |

**What works and should stay:**
- The Attio chrome is faithful: 240 px sidebar, 52/52/44 bars, 40 px rows, full hairline grid, sticky name column, preview icon on hover, and a floating bulk bar.
- Gold is used mostly correctly.
- No page scrolls horizontally at 390, 768 or 1440 (I checked every route).
- The failing-webhook path is excellent end to end. A Retrying row appears with an inline Retry button. The delivery sheet shows Retry now, request headers and the payload. Home adds a "Failing webhooks" group within 5 s.
- Memos and Samples are **not duplicates**. The memo record is a document: Issued to, Handed over by, Terms, an itemised value-at-issue table and an acknowledgement footer. The sample record is per-piece custody. Keep them this way.
- No dead controls among the ones I clicked:
  - Header controls: Call (`tel:`), Navigate (Maps), Edit (sheet), Assign visit (dialog with a route check), workspace menu, user menu, and the rate chip (goes to Settings).
  - Tabs: every tab and every tab count.
  - Tables and search: row click, preview ↑/↓/expand/✕, sort chip, Clear filters.
  - Integrations: Reveal, Rotate, Edit URL, Add endpoint.

## Fixes per page

### Home: 8.5 (target 10)
1. **[Truth] The "Samples outside" header total does not equal its rows.** The section header reads **₹14.7L** (value at today's rate), but the rows read ₹6.84L + ₹7.69L = ₹14.53L (memo value at handover). The Shops list shows the same shops as ₹6.95L / ₹7.72L. Evidence: `home-1440.png` "Samples outside 2 ₹14.7L" against its rows, and `shops-1440.png` Samples column. Fix: use one basis for the header and the rows. Use today's value, as the metric strip does, or label the rows "at handover".
2. **[Truth/IST] Greeting is computed in browser time, not IST.** At 01:14 IST the page said "Good evening, Priya" (19:44 UTC), while the date line is correctly IST "Thursday 22 October". Fix: derive the greeting hour with `istDate`. After midnight it should say "Good night" or simply "Hello". Evidence: `home-1440.png` top left.
3. **[Consistency] The activity rail repeats events and the actor avatars are wrong.**
   - "ORD-38 needs approval" plus a nested "Needs approval: Over credit limit" card, followed by "Kavya Nair booked ORD-38". That is three renderings of one fact. Show one row per order event and drop the nested reason card, because the reason is already in the sentence.
   - Retailer actions ("Kapoor & Sons acknowledged…") carry the agent's avatar (AS/RV). Use the shop's initials avatar.
   - Evidence: `home-1440.png` right rail, `shop-kapoor-1440-s1.png`.
4. **[Layout] Right rail and main column end unevenly.** The main column ends at Check-ins, and the 380 px activity rail runs 2 screens longer, leaving a large blank area under the left column. Evidence: `home-1440-s2.png`. Fix: cap the rail at about 12 items with "View all", or make it sticky with its own scroll.
5. **[Density] Check-ins rows have no date for cross-day visits.** The "Check-ins 3" list includes Sethi's **11:38 pm (yesterday)** check-in with no date. Add "21 Oct" when the check-in is not today. Evidence: `home-1440-s1.png`.
6. **[Polish] Text is cut off mid-word.** Needs-attention meta truncates "due 20 …" and the simulated line truncates "not veri…" in Field today. Give the meta column a priority order: due date before agent name.

### Shop record: 8.5 (target 10)
1. **[Hierarchy] The same facts appear three times.** Assigned agent, Last visit and Upcoming visit appear in the left panel, again in Highlights, and partly again in Credit position. Credit figures appear in the panel Credit section and again in the Credit position block. Evidence: `shop-kapoor-1440.png`. Fix:
   - Highlights should hold only what the panel lacks: Samples here, Active memos, Last order (and hide Last order when there is none).
   - Collapse the panel's Credit section by default, or remove it now that Credit position exists.
   - Attio's highlights never mirror the attribute panel.
2. **[Truth/clarity] Empty "Last order" highlight.** "Last order: None / No orders yet" takes a full highlight card in 16 px. Drop the card when it has no data.
3. **[Visits tab] The card looks unfinished.** Evidence: `shop-kapoor-tab-visits-1440.png`.
   - The date column wraps ("Today, 2:30 / pm", "21 Oct, 10:30 / am").
   - The list card has no column headers.
   - The numbers "22 m" and "11:30 am" are unlabelled.
   - Fix: make it a real mini-table (Planned · Agent · Status · Proof · Distance · Check-in) with nowrap dates.
4. **[Consistency] The Orders tab empty state is a 190 px bordered empty card.** Evidence: `shop-kapoor-tab-orders-1440.png`. Overview's "Open orders 0" is plain text, and v3 says "an empty feed is plain text, never an empty card". Make them match.
5. **[Activity] One handover appears as two events.** "left 2 samples at Kapoor & Sons" and "2 samples moved Arjun Singh → Kapoor & Sons" show the same two piece chips one after the other. Evidence: `shop-kapoor-tab-activity-1440.png`. Merge piece.moved into the memo event when they share a source event.
6. **[Polish] "Last visit" wraps badly.** It renders as "Yesterday, 12:25 pm · Arjun / Singh". Put the agent on its own meta line, as Upcoming visit does in Highlights.

### Sample record: 9 (target 10)
1. **[Interaction] The status chip looks like a button.** "Overdue" and "In vault" are 32 px bordered elements in the action row next to the primary button, so they read as buttons. Evidence: `samples_pc_01M5FZT2J77SQWETFBQ7J9F3ZN-1440.png` header. Move the soft chip beside the tag name, as the Order and Memo headers do.
2. **[Action] An overdue piece offers no next step.** The page answers where the piece is, but the manager can only "Open MEMO". Add an actionable secondary such as "Extend due date" or "Remind Rahul" next to the overdue line in the "Due back" cell.
3. **[Density] Custody is told four times.** It appears in the Who/Why/Since/Due grid, the journey strip, the stage headers inside the ledger ("Vault since 8 Oct", "Rahul Verma since…") and the panel Custody section. Fix: drop the stage headers from the ledger, since the strip already shows stages. Also drop the "Taken into stock" nested card, which repeats its own sentence (`samples_pc_01M5FZT2J6BH2R6HN61CP5VC0Y-1440.png`).
4. **[Responsive] The photo is hidden at 768 and 390.** At these widths the Piece and Custody panel sections collapse, so the photo disappears. Evidence: `mont-768-b.png`, `mont-390-b.png`. Keep the 56 px thumbnail plus value visible in the header row.

### Visit record: 8
1. **A planned visit is a wall of "No value".** There are 6 highlight cards and 8 panel rows of "No value/None". Evidence: `visits_cmviirr06005c7d9s5efh1kms-1440.png`. Fix:
   - Replace the Highlights grid with one line: "Not started — stop 1 on Rahul's route, planned 10:30 am".
   - Hide the check-in rows until they exist.
   - The empty "Visit proof 0" bordered card should be plain text.
2. **The planned geofence circle is drawn in gold/tan.** Gold is reserved for value. Use neutral grey, as the verified fence uses green.
3. **Highlights duplicate the panel on in-visit records.** Verification, distance and duration each appear twice (`visits_cmviirr17005v7d9sqhxrh6iu-1440.png`).

### Visits list: 8
1. **Columns truncate at 1440.** "Rahul Ver…", "Greater Kail…", "Chandni Ch…" and "Malhotra Diamo…" are cut off, while Planned, Check-in and Distance have spare width. Evidence: `visits-1440.png`. Fix: Agent min 150, Area min 140, and shrink Planned/Check-in to 96.
2. **Rows are 50 % dashes.** Planned rows show "— — — — —". Render a single muted "Not started" spanning Check-in→Outcome, or leave the cells empty.

### Memos list: 8
1. **Cells clip at 1440.** "2 days overd", "Due tomorrov", the Acknowledged column and the search placeholder ("tag cod") are cut off. Evidence: `memos-1440.png`. Fix: put due-relative text on a second line or give Due 170 px; widen Agent ("Rahul Ver…").
2. **The page wastes space with only 2 memos.** Add the pieces' thumbnails (stacked 20 px) in the Memo cell so it reads as a document list.

### Shops list: 8.5
1. **The Status column is clipped at 1440** ("Memo overdu"), and Next visit truncates ("Today, 12:00 …"). Evidence: `shops-1440.png`. Format as "12:00 pm" when the date is today, and widen Status.
2. **The header checkbox is a solid blue square when 2 of 10 rows are selected.** It should be the indeterminate dash. Evidence: `shops-selected-1440.png`.
3. **"Sorted by" cycles the sort on click with no menu.** The click silently switched to Outstanding (`shops-sort-1440.png`). Open a menu of fields plus a direction.

### Order record: 8.5
1. **The total appears four times.** It is in the panel Totals, the credit block "Order amount", the Highlights "Total incl. GST" and the line-items footer (`orders_cmviirr28006b7d9s2uxg1unx-1440.png`). Drop either the panel Totals or the highlight.
2. **[Truth] The rate snapshot reads "Priced at 22K ₹10,540/g, set 22 Oct, 1:12 am".** The order was booked at 12:58 am, so the rate appears to have been set after the booking. This is seed timing, but the UI should show the snapshot row's own effective time, or "rate in force at booking". Verify against the API rate-row timestamp.
3. **About 50 px of dead space inside the pending verdict cell**, between the legend and "Evaluated by…". Align the right figures column and the left content to the top.
4. **Truncation and an unlabelled button.** The header subtitle cuts to "Kamla Na…", the line item to "Heritage Templ…", and the third ⊘ button has no visible label (add a tooltip "Cancel order").

### Agents list / Agent record: 8.5
- List: "Jain Orname…" and "Yesterday, 2:20 …" truncate while Today progress has slack (`agents-1440.png`).
- Record: the "Orders today: None yet" highlight sits beside an "Orders 3" tab (all-time). Label the tab count scope, or show "3 total" in the highlight sub-line.

### Catalog: 8.5
- No footer sums: add total in vault / total out.
- The Making column mixes "12%" and "₹650/g" with no hint. Add a header tooltip.

### Integrations: 8.5
1. **The endpoint shows "Enabled" with a green dot while every delivery fails.** Evidence: `integ-failing-1440.png`. Show the endpoint health ("Failing · 1 retrying") next to Enabled.
2. **Vocabulary mismatch:** the status line says "1 failed" while the row says "Retrying". Use the same word.
3. **The Add-endpoint error message is misleading.** For an unresolvable public hostname it says "private and loopback addresses are refused", and it repeats itself. Evidence: `integ-newendpoint-1440.png`. It should say "We couldn't resolve that host".
4. **390 layout:** the secret, Reveal and Rotate wrap into 3 lines and the endpoint switcher is cut off (`mont-390-c.png`).

### Settings: 8.5
- The disabled Save is a filled grey block that looks broken. Use the outlined, disabled-opacity style, as other forms do.
- The Workspace copy has an ALL-CAPS "SIMULATED".
- The Set rate dialog says "0 24K designs and 0 sample pieces are re-priced". When the count is 0, say "No 24K designs or pieces yet".

### ⌘K: 8.5
- Results cap at 5 with no "Show all 10".
- Sample results lack where the piece is (add "at Mehta · overdue" as meta).
- The quick actions omit the spec'd "Assign visit" and "New shop".

### Global micro-polish
- **Forms:** the native date input renders US format "10/22/2026" (Assign visit), and Edit shop shows Credit limit "3000000" raw. Use the Popover+Calendar ("22 Oct") and an ₹-prefixed, grouped input.
- **390:** tables clip mid-column ("Arjun", "Assig") with no edge fade or scroll hint. Add a right-edge fade on the table scroller.

**VERDICT: fix the top items above.** None of the three 10-targets reaches 10. Home (8.5) and the Shop record (8.5) are held back mostly by duplication and two number-truth issues: Home's samples total versus its rows, and the rate snapshot time.
