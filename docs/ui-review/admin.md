# Admin / manager UI — refinement rounds

Scope: `/admin` Home, Visits, Agents, Shops, Orders, Memos, Samples, Catalog, Integrations, Settings, every
record page, the side-sheet previews and ⌘K. Reference: Attio product UI (help-centre captures in the
scratchpad `attio/` folder — record page, companies table, activity tab, bulk bar, quick actions) and the
measured values in `docs/DESIGN.md` v2/v3. Design authority: emil-design-eng (motion, press feedback,
easing, perceived performance). Screens are judged at 1440 (primary), 768 and 390.

Scores are 1–10 on hierarchy · spacing · typography · interaction · density · consistency · responsiveness ·
polish, then an honest overall. "Attio" below means the reference capture the screen was compared with.

## Round 0 — baseline (fc5b2ab)

The v2/v3 Attio chrome was already in place (sidebar, list chrome, hairline grid, record layout, activity
model). What held the key screens back:

| Screen | Overall | Weakest details |
|---|---|---|
| Home | 7.5 | Needs attention was a flat wall (8 of 12 rows "not checked in", approvals buried at the bottom); nothing for samples outside or the day's orders; activity squeezed beside the map; 5-column metric labels truncated on tablets. |
| Shop record | 8 | Credit facts split between panel and highlights and duplicated (Outstanding twice, exposure twice); the brief's seven facts were not readable in one glance. |
| Sample record | 8.5 | The "where is it" answer was one wrapped sentence; purity/weight/value hidden under the photo; the on-memo state was a disabled-looking box instead of an action. |
| Orders list | 7.5 | Order number truncated to "ORD-202…"; every amount gold; approval reasons cut mid-word; Payment column off-screen at 1440. |
| Order record | 8.5 | Status not in the header; empty "Decided by / Decided at / Payment" rows on a pending order; exposure bar legend was prose. |
| Memo record | 7.5 | Read like the sample record (custody timeline first) — not a document. |
| Memos / Visits / Shops lists | 8 | Header labels truncated ("Plan…", "Dista…", "Assigned ag…"); plain-text cells clipped instead of ellipsis. |
| ⌘K | 6.5 | Stock shadcn palette, zoom animation on a 100×/day surface, duplicated meta. |
| Integrations | 8 | Two endpoints both labelled "localhost:4303 · built-in receiver"; delivery sheet close button hidden under the sticky header; "next in 0 min". |
| Settings | 8.5 | Content centred under left-aligned tabs; history table entirely gold. |
| Mobile (390) | 7 | Two stacked headers (shell bar + page title bar); record panels pushed tabs a full screen down. |

## Round 1 — structure (cd8d43f)

- **Home**: Needs attention grouped by kind (overdue memos → approvals → missed check-ins → … → simulated),
  each group a 36px tinted header with icon + count + "Open list", capped at 3 rows with "Show N more".
  New side-by-side "Samples outside" (active memos: shop, pieces, agent, value, due — API `daysToDue`) and
  "Orders today" (number, time, status). Activity moved to a 380px right rail; the timeline is now
  container-query aware and stacks amount · time under the sentence below 512px.
- **Shop record**: Overview opens with a *Credit position* block (Outstanding · On memo · Available ·
  Limit, compact figures, exposure bar + legend + "₹18.8L of ₹40L used"), then six non-overlapping
  highlights (Assigned agent, Last visit, Upcoming visit, Samples here, Active memos, Last order). Exact
  rupee figures stay once, in the panel (the e2e strict-text assertions rely on that).
- **Sample record**: `WhereNow` answer block — headline place ("At Kapoor & Sons, South Extension"),
  then a 4-cell grid *Who has it · Why · Since · Due back*, then the acknowledgement line. Header subtitle
  carries design · purity · net weight; the on-memo primary action is "Open MEMO-…". Shared with the
  preview (compact 2×2).
- **Memo record**: the Overview tab is the memo as a document — "Approval memo" header + status chip,
  Issued to / Handed over by / Terms, itemised pieces with value at issue, Memo value + Outstanding
  totals, and the acknowledgement as a signature footer. Custody moved to its own tab.
- **Orders list**: number column un-truncated, amounts ink (gold kept for custody value), approval cell =
  shield icon + short frozen reason ("Over limit by ₹1.29L", "≥ ₹10L threshold") or "Approved by Priya",
  full sentence in the tooltip; fits 1440.
- **Order record**: status chip in the header; Decided/Payment rows only when they apply; legend with dots
  for outstanding / memo / this order / limit.
- **Shops list**: "Credit left" column (thin exposure bar + available, red "Over ₹X" when over limit);
  memos + samples merged into one "Samples" column with an overdue dot.
- **Chrome**: `press` utility (0.97 scale, 150ms strong ease-out, reduced-motion safe), easing tokens
  (`--ease-out-strong`, `--ease-drawer`), focus rings on buttons/chips/tabs, preview panel on the drawer
  curve (220ms in / 140ms out, transform strings), tooltips with key hints on preview controls, breadcrumb
  record bar (object icon + list › record), ⌘K rebuilt on cmdk + Radix with **no** open animation,
  grouped results, quick actions, key-hint footer. One header on phones: the sidebar toggle lives in the
  page's TitleBar / breadcrumb and the drawer is a Radix sheet.

| Screen | Overall after round 1 |
|---|---|
| Home | 9 |
| Shop record | 9 |
| Sample record | 9.5 |
| Orders list | 9 |
| Order record | 9 |
| Memo record | 9 |

## Round 2 — fit, density, responsive

- DataTable: 10px cell padding (Attio's), plain-text cells wrapped so they ellipsis instead of clip,
  widths re-budgeted so no header truncates at 1440 (Visits, Shops, Memos, Orders).
- PropertySection `collapseBelowLg`: below 1024px the facts the main column already shows start collapsed
  (Credit/Shop details, Custody, Totals, Memo details), so tabs and the answer come right after the record
  header. Decided in CSS before the first toggle — no hydration mismatch.
- Home metric strip 2 → 3 → 5 columns (390 / 768 / 1280+); "Overdue memos" label; attention titles wrap to
  two lines on phones instead of truncating.
- Sample record on phones: the big photo hides (thumbnail stays in the header) so the custody answer is the
  first thing after the header.

## Round 3 — states and secondary screens

- Empty list = header stays + message + "Clear filters" (Orders, Memos, Samples, Visits; Shops had it).
- Preview icon gets a fade in the row's own colour (`--row`) so it never sits on top of the record name.
- Integrations: selector labelled by description (pause / alert icon for disabled / failing endpoints);
  Endpoint column only when "All endpoints" is on; delivery sheet has its own close button; relative
  times under a minute read "in under a minute".
- Settings: content left-aligned with the tabs; history purity gold, rates ink, deltas neutral.
- Catalog: price ink in the table (purity stays gold; the grid view keeps its commerce treatment).
- ⌘K: order/memo meta no longer repeats the number.
- Long names and crore values checked with "Shree Ratnakar Jewellers & Diamond Merchants Private Limited",
  limit ₹2.5Cr, outstanding ₹1.87Cr: header truncates with a title tooltip, breadcrumb carries the full
  name, every figure formats (₹1.87Cr / ₹1,87,45,321).
- Shop preview: compact 2×2 credit block (same component as the record) + highlights.

## Final — production build (ba86c51 + this note)

Gates: web typecheck 0, lint 0, `next build` 0. On the production server,
`playwright test e2e/manager-flow.spec.ts e2e/admin-webhooks.spec.ts --project=admin` → 7/7 passed. (In this
worktree the old path-wide `testMatch` also pulls field/auth/landing specs into `--project admin` because the
folder is named `wt-adminui`; main's anchored config does not.) The agent-route map that looked unfitted in
dev is fitted in production — the dev-only StrictMode double effect re-creates the map after `fitOnce` ran.

| Page | Hier. | Spacing | Type | Interact. | Density | Consist. | Resp. | Polish | Overall |
|---|---|---|---|---|---|---|---|---|---|
| Home | 10 | 9.5 | 10 | 9.5 | 10 | 10 | 9.5 | 9.5 | **9.5** |
| Shop record | 10 | 9.5 | 10 | 9.5 | 10 | 10 | 9.5 | 9.5 | **9.5** |
| Sample record | 10 | 10 | 10 | 9.5 | 10 | 10 | 9.5 | 10 | **10** |
| Orders list | 9.5 | 9.5 | 9.5 | 9.5 | 10 | 9.5 | 8.5 | 9.5 | **9.5** |
| Order record | 9.5 | 9.5 | 9.5 | 9.5 | 9.5 | 9.5 | 9 | 9.5 | **9.5** |
| Memo record | 9.5 | 9.5 | 9.5 | 9 | 9.5 | 9.5 | 9 | 9.5 | **9.5** |
| Shops list | 9.5 | 9.5 | 9.5 | 9.5 | 10 | 9.5 | 8.5 | 9.5 | **9.5** |
| Samples / Memos / Visits lists | 9 | 9.5 | 9.5 | 9.5 | 9.5 | 9.5 | 8.5 | 9 | **9** |
| Visit / Agent records | 9 | 9 | 9.5 | 9 | 9.5 | 9.5 | 9 | 9 | **9** |
| Catalog | 9 | 9 | 9.5 | 9 | 9.5 | 9 | 9 | 9 | **9** |
| Integrations | 9 | 9 | 9 | 9.5 | 9.5 | 9 | 8.5 | 9 | **9** |
| Settings | 9 | 9.5 | 9.5 | 9 | 9 | 9.5 | 9 | 9 | **9** |
| ⌘K / previews | 9.5 | 9.5 | 9.5 | 10 | 9.5 | 10 | 9 | 9.5 | **9.5** |

Honest gaps: Home and Shop record miss a straight 10 on interaction/polish (single-item attention groups
still spend a header row; the shop panel repeats exact credit figures the overview shows compactly, kept on
purpose because the e2e asserts each exact rupee string once). Tables at 390 px scroll horizontally behind a
sticky first column rather than switching to a card list — acceptable for a laptop-first admin, not a 10.

## Critic round (docs/ui-review/critic-admin.md)

Every item in the critic's file was worked; screenshots in the session scratchpad `ui/admin/r7` and `r8`.

- Home: one basis for samples (today's rate, same as the metric, said so in the card); "Hello" at night;
  attention rows two-line; activity rail sticky with its own scroll; duplicate order/custody events folded;
  check-ins outside today show their date; simulated fixes read "Simulated · not verified".
- Shop record: highlights no longer repeat the credit block; Credit panel section collapsed (overview owns it);
  visits are a mini-table; empty tabs are plain text.
- Sample record: status chip sits with the tag, value in the header, photo at every width, "Extend due date"
  from Where-now, ledger without stage headers or id-only evidence cards.
- Visit record: a planned visit shows one status card and "Awaiting check-in" instead of empty GPS facts;
  fence is neutral grey when there is no fix.
- Lists: widths rebalanced (no truncated Agent/Area/Duration), indeterminate checkbox, sort is a menu,
  right-edge fade when a table scrolls, memo rows show piece thumbnails, simulated distance reads "Not measured".
- Order record: no duplicate Totals panel, GST highlight not truncated, rate snapshot says "the rate row in force
  at booking". Data note: in the seed, the snapshot's `effectiveFrom` (e.g. 2026-10-21T20:00:05Z) is later than
  the order's `createdAt` (19:46Z) — the API returns it that way; the UI shows what the API says.
- Integrations / Settings / Catalog / ⌘K / forms: failure copy, healthy vs failing endpoint, quick actions
  (assign visit, new shop), "Show all matching", date picker, Indian grouping in credit inputs.

| Page | Before (critic) | After |
|---|---|---|
| Home | 8.5 | 9.5 |
| Shop record | 8.5 | 9.5 |
| Sample record | 9 | 10 |
| Order record | 8.5 | 9.5 |
| Visit record | 8 | 9 |
| Visits / Shops / Memos / Agents lists | 8–8.5 | 9 |
| Agent record | 8.5 | 9 |
| Integrations / Settings / Catalog | 8.5 | 9 |
| ⌘K | 8.5 | 9.5 |
