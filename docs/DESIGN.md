# JewelRoute design system (read before writing any UI)

**One sentence:** a quiet, exact instrument for people who move gold around a city — paper-white, ink-black, and gold only where value is.

## Tokens (already in `apps/web/src/app/globals.css`, use the Tailwind names)
| Token | Hex | Use |
|---|---|---|
| `bg-paper` | #fcfbf8 | app background |
| `bg-surface` | #ffffff | panels, sheets, table rows |
| `bg-sunken` | #f5f3ee | wells, image backdrops, inactive chips |
| `text-ink` / `text-ink-2` / `text-ink-3` | #191714 / #5d584f / #8f897d | primary / secondary / tertiary text |
| `border-line` / `border-line-strong` | #e9e5dc / #d6d0c3 | hairlines (1px) / inputs |
| `bg-gold`, `text-gold-ink`, `bg-gold-soft` | #b08a35 / #85661f / #f4eddc | **only** for value: money totals, purity, custody/samples, the active rate. Never for buttons or decoration. |
| `verified`, `warn`, `danger`, `info` (+ `-soft`) | | GPS verified / due soon, retrying / overdue, outside fence, rejected, dead letter / checked-in, simulated |

Primary buttons are **ink** (`bg-primary` = near-black). Secondary = white with hairline. Destructive = danger. Shadows: none on cards — separate with hairlines and space; `shadow-float` only for things that float (map controls, popovers, sticky action bars, sheets).
Radius: controls 10px (`rounded-lg`), panels 14px (`rounded-xl`), photos 12–18px. Pills are full-round.

## Type
- UI: **Schibsted Grotesk** (`font-sans`, default). Body 14px admin / 15–16px field. Numbers always tabular (`.num`, automatic in `td`).
- Display: **Newsreader** serif (`font-display`) — used sparingly: catalog design names, the landing page headlines, big totals on the sale review, the retailer acknowledgement page title. Never for UI labels.
- Scale (px): 12 / 13 / 14 / 16 / 18 / 22 / 28 / 36 / 48 / 64. Headline tracking −0.02em. Sentence case everywhere. **No ALL-CAPS eyebrow labels**, no "01/02/03" markers unless it's a real sequence (visit route order *is* a sequence — numbering stops is correct there), no `→` glued to button text, no middle-dot meta strings as decoration, no gradient washes, no one-word-in-italic headline accents.

## Components to reuse
- `@/components/ui/*` shadcn (radix) primitives: Button, Input, Dialog, Sheet (side panels for approvals/details), Drawer (mobile bottom sheets on field pages), Tabs, Table, Select, Popover+Calendar (dates), Checkbox, Switch, Tooltip, Skeleton, Sonner toasts, InputOTP (6-digit retailer code), Command, ScrollArea, Progress, ToggleGroup.
- `@/components/jr/map` `JrMap` (MapLibre + OpenFreeMap; markers with tones `planned|next|active|done|alert|muted|gold`, optional `badge` (route number), `me` position, `fence` circle, `route` line).
- `@/components/jr/status` `Pill`, `VisitStatusPill`, `MemoStatusPill`, `OrderStatusPill`, `DeliveryStatusPill`, `VerificationPill`.
- `@/components/jr/money` `Money` (`compact` → ₹14.9L), `Grams`, `PurityTag`. `@jewelroute/shared` has `formatINR`, `formatINRCompact`, `formatGrams`, `formatRate`, `distanceM`, `geofenceDecision`, `istDate`, `memoDisplayStatus`, `priceDesign`, `EVENT_DESCRIPTIONS`.
- `@/components/jr/logo` `Logo`.
- `@/lib/api` `api<T>(path, {body, method, idempotencyKey})` → unwraps `{ok,data}`, throws `ApiError{status,code,message,details}`, auto-refreshes the session once on 401. `@/lib/types` mirrors the contract. `@/lib/session` `useMe()`, `logout()`. `@/hooks/use-geolocation`.
- TanStack Query for all server state (query keys: `["today"]`, `["visit", id]`, `["catalog", id, filters]`, `["dashboard"]`, `["orders", status]`, `["memos", filter]`, `["webhooks"]`, `["deliveries", endpointId]`, …). Invalidate the right keys after mutations; poll the admin dashboard every 10s and the deliveries list every 5s while the tab is visible.
- Motion (`motion/react`) only for responses to actions: sheet/drawer open, check-in success, items entering the cart, the activity feed inserting new rows. One page-load moment max (the landing hero).

## Copy voice
Plain, specific, active. "Check in", "Book order", "Leave on memo", "Return samples", "Complete visit", "Approve order". Errors say what happened and what to do: "You're 214 m from Sharma Jewellers. Check-in opens within 100 m." Empty states invite the next action. Indian formatting: ₹1,48,500 and ₹14.9L, dates "21 Oct", times "11:42 am" (IST).

## References used (patterns, not branding)
Linear (dense, keyboard-calm lists, status icons, nothing shouts), Attio (record page: attribute rail + activity timeline + side panels), Ramp (money-first metric strip where only exceptions are coloured), Apple/Shopify product pages (photo first, then a clear price hierarchy), Stripe developer settings (webhook endpoint page, masked secret with reveal, event list with checkboxes, delivery attempts table with status/latency and a resend button).

## Responsive
Field pages are phone-first (375px): single column, sticky bottom action bar (`safe-bottom`), 44px touch targets, Drawer instead of Dialog. Admin is laptop-first (1280–1536px) but must not break on a tablet.


---

# v2 — Attio-grade application chrome (supersedes the app-chrome parts above; 2026-10-21)

The authenticated app (admin **and** field chrome) follows Attio's product patterns closely. Landing page and the catalog keep their own premium-commerce treatment (Newsreader for design names, big photography).

**Reference screenshots (Attio help-centre, study them before building — do not ship them):**
`/tmp/claude-0/-home-claude/88dfd755-9b6f-51f7-b59f-222ce551b7df/scratchpad/attio/`
- `attio-sidebar.png` — sidebar + companies table (2× scale)
- `navigatingattio_mainpanel.png`, `underestanding_records_homeview.png` — list page chrome: title row, view row, sort/filter row, table, count footer
- `all-records-actions.png` — row selection + floating bulk action bar
- `full-record-page-overview.png`, `record-details-record-page.png`, `understandingrecords7.png` — record page: left details panel, tabs, highlights, activity/emails/notes sections
- `activity-tab.png` — activity timeline (grouped "Upcoming / This week", avatar + "Name verb object", time right, dotted connector, nested event cards)
- `create-record-quick-actions.png` — quick actions / ⌘K

## Measurements (CSS px; screenshots are 2×)
- **Font: Inter** (`--font-ui`), 14px base, 13px secondary/meta, 12px badges; weights 400/500/600 only. Page title 14–15px **500** with a 16px object icon (Attio titles are small, not marketing-big). Record name 18px 600.
- **Colours (neutral chrome; gold only for value):** text `#1c1d1f`, secondary `#6e6f73`, tertiary `#9b9ca0`; app bg `#ffffff`; sidebar bg `#fbfbfa`; hairline `#ececec` (table grid + section dividers), control border `#e3e3e3`; hover row `#f7f7f8`; selected row `#eef3fe` with focus ring `#3a6ff2`; link/selection blue `#2f6bf2` (used sparingly: selection, focus, links). Keep JewelRoute gold `#b08a35/#85661f` for money totals, purity tags, custody/samples; semantic soft chips for status (green verified, amber due/retrying, red overdue/dead, blue checked-in/simulated, grey planned).
- **Sidebar:** 240px, bg `#fbfbfa`, right hairline. Top: workspace switcher row (24px square logo + "Aurum Jewels" 14px 600 + chevron) 52px tall, collapse icon right. Search field 32px (icon, "Search", `⌘K` kbd chip right). Nav items 30px tall, 16px icons `#6e6f73`, label 14px, 8px radius, active `#efefef` + text 500, hover `#f3f3f3`. Section labels ("Field", "Sales") 13px `#9b9ca0` with collapse chevron, 16px top margin. Footer: user row (avatar 20px + name) and "Help".
- **List page chrome (top→bottom):** title bar 52px (object icon + title + info icon; right: avatar/⋮/primary button "+ New shop" 32px ink button) with bottom hairline → view bar 52px (view selector button "All shops ▾" with coloured 16px icon, "View settings" button; right: export) → sort/filter bar 44px ("Sorted by Last visit" chip, dashed "Filter" chip, active filter chips with counts, search input) → table.
- **Table:** row 40px; header row 36px with attribute icon (14px) + label 13px 500 `#1c1d1f`; vertical + horizontal hairlines; first column sticky with checkbox (16px, appears on hover/selection) + 20px avatar/thumbnail + name 14px 500, underline on hover, click opens record; numeric columns right-aligned; status cell = 8px dot + label or soft chip; truncation with ellipsis; footer row "N count" + per-column "Add calculation"-style summaries (we show real sums: total value). Row hover `#f7f7f8`; selected `#eef3fe`. Selecting rows shows a floating bulk bar at bottom centre ("2 selected · Assign agent · Export · ✕").
- **Buttons:** 32px (28px compact), radius 8px, 1px border `#e3e3e3`, bg white, subtle shadow `0 1px 2px rgb(0 0 0 / .04)`, 14px 500 text, 16px icon gap 6px. Primary = ink `#1c1d1f` bg white text. Dashed-border "ghost add" chips for empty filters.
- **Record page:** two columns. **Left panel 400px** (resizable feel, right hairline): header (40px avatar/icon + name 18px 600 + star/edit icons), action row (primary outlined wide button + 32px icon buttons), "Shop details ▾" section of **property rows** (icon 16px + label 14px `#6e6f73` in a 160px column + value 14px; empty value "No value" `#9b9ca0`), "View all values" link; further sections (e.g. "Samples here 6", "Assigned agent") as compact cards. **Main column:** tab bar (icon + label + count chip, 14px, active tab = underline 2px ink + bg `#f3f3f3` pill), then Overview: "Highlights" grid of small cards (3 columns, 1px border radius 10px, label 13px grey + icon right, value 15–16px 500), then "Activity" list card with "View all", then related sections (Orders, Memos) as bordered list cards with 36–40px rows.
- **Activity timeline:** grouped by "Today / This week / Earlier" (13px 600). Each event: 20px avatar/icon, "**Rahul Verma** checked in at **Sharma Jewellers**" (actor + object 500, verb `#6e6f73`), time right 13px grey; dotted 1px vertical connector between avatars; rich events nest a bordered card (photo thumbnail, order lines, memo pieces).
- **Drawers/side panels:** right side panel 560–640px for record previews (header: "1 of 24 in Today's visits", ↑ ↓ to step, expand-to-full-page icon, ✕). Modals 480–560px, radius 12px, 20px padding, title 15px 600.
- **Empty states:** small icon, one line of 14px 500, one line of guidance, one button. No illustrations.
- **Density & motion:** no big cards, no page-level shadows, no gradients. Motion only for panel open/close (150–200ms ease-out), row insertion in feeds, and selection bars.
- **Command menu:** ⌘K opens cmdk palette (search shops, pieces by tag, orders, memos, agents; actions: "Assign visit", "Set gold rate", "New shop").

## Field app (mobile) under v2
Same tokens and Inter, but a mobile shell: bottom tab bar (Today, Visits, Catalog, Profile — 56px + safe area, 22px icons, 11px labels), compact sticky top bar (page title 17px 600), route rows 64–72px (time · name · area · distance · memo badge), one dominant next-visit row (subtle ink left border + "Open visit" button), sticky bottom primary action. One-handed: primary actions live in the bottom 40% of the screen.

---

# v3 — Attio pattern log (2026-10-21)

Refero MCP was not connected in this session; references are real Attio product screens from the Attio help centre, saved in the scratchpad `attio/` folder: `full-record-page-overview.png`, `record-details-record-page.png`, `activity-tab.png`, `attio-sidebar.png`, `navigatingattio_mainpanel.png`, `all-records-actions.png`, `company-tab.png` (relationship tab), `record-actions.png`, and the help text of "Preview a record from a table or kanban view" (no image). Screens are 2×; measurements below are CSS px.

| JewelRoute surface | Attio screen matched | Measurements taken → applied |
|---|---|---|
| Every list page (Visits, Agents, Shops, Orders, Memos, Samples, Catalog) | Companies table (`attio-sidebar`, `navigatingattio_mainpanel`) | Title bar 52 · view row 52 · sort/filter row 44 · header 36 with 14px attribute icon · rows 40 · full hairline grid `#ececec` · checkbox appears on hover · first column sticky, name underlined (dotted) on hover · "N count" footer. Unchanged from v2; Visits widths raised so no header truncates ("Planned", "Check-in", "Distance", "Duration"). |
| Row preview → side sheet | Help: "Preview a record from a table" (hover icons on a row, preview on the right, row stays highlighted, header "1 of 500 in Entire Pipeline", ↑ ↓ arrows, expand icon, ✕) | `components/app/record-preview`: 600px right panel, 44px header with ↑ ↓ (also keyboard ↑/↓/j/k), "3 of 24 in Pending approval", expand → full record, ✕/Esc. Body = Attio preview order: Highlights → Activity ("View all") → related list. Preview icon (24px, hairline, white) overlays the right edge of the first cell on hover; the previewed row keeps the selected fill `#eef3fe`. Wired on every list. |
| Table keyboard | Attio tables (↑ ↓ move, Enter opens, Space previews, x selects) | `DataTable` container is focusable; keyboard row = hover fill. It scrolls only its own container, only after a keyboard move or a preview step — never the page, never on mount. |
| Record pages (Shop, Order, Memo, Sample, Visit, Agent) | `full-record-page-overview` + `record-details-record-page` | Left panel 400px; header 40px lead + 18px/600 name; one wide outlined primary + 32px icon buttons; property sections titled "Company details ▾" style (14px/500 + chevron), rows label column 150px `#6e6f73` + value 14px, empty = "No value". Shop panel is now three sections like Attio's grouped attributes: Relationship · Credit · Shop details. |
| Record tabs | Overview / Activity / Emails tabs (`full-record-page-overview`, `company-tab`) | Icon + label + count chip (18px, hairline), active = soft pill + 2px ink underline. Shop tabs are exactly Overview · Visits · Orders · Memos · Activity. |
| Overview highlights | "Highlights" 3-col cards (Estimated ARR, Funding raised, Deals…) | 3 columns, 1px hairline, radius 10, label 13px grey + 16px icon right, value 15px/500, sub 12.5px. Shop: Credit exposure (with a thin bar), Samples here, Active memos, Outstanding, Last visit, Upcoming visit. |
| Activity timeline (one `ActivityFeed`) | `activity-tab` ("This week", avatar, "**Sam Stephenson** attended a meeting", time right, dotted connector, nested card with coloured left rule) | Groups Today / Yesterday / This week / Earlier (13px/600); 20px avatar for human actors, icon bubble only for system events (memo.overdue); "**Actor** verb **Object**" with every ref linked; time 13px right; nested evidence card only when `detail` has something (photo, reasons, from → to, piece chips). Overview shows a compact framed list ("Activity · View all") like Attio's overview card; an empty feed is plain text, never an empty card. "Load more" via `nextCursor`. |
| Sample record (hero) | Record page + activity nested cards; the "where is it" line is our own answer pattern on Attio's type scale | One-line answer 16px ("**At Sharma Jewellers, Karol Bagh** · since 5:43 pm · on MEMO-… · due Mon 26 Oct") + acknowledgement line with shield icon + value at right; a custody journey strip of 148px stage cards (current = gold hairline), dashed "Next" card; ledger rows are Attio nested cards with a 3px coloured left rule per transition kind. |
| Order approval block | Attio record overview cards | One bordered block, two columns: verdict + reasons + exposure bar (left, amber wash only when pending) and the five figures as hairline rows (right). |
| Settings → Approvals | Attio workspace settings property rows | Property rows (icon + label column + value), inline 32px input with ₹ prefix + Save. |

Rules carried from v2 and enforced in this pass: gold only on money/purity/samples (the exposure bar's memo segment is gold, outstanding is ink); status = 8px dot + label in tables, soft chip only in record/preview headers; no empty grouping cards; one status vocabulary (`components/app/status.tsx`) for every order/memo/piece/visit label.
