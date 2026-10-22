# Admin UI scores (22 Oct 2026, ~06:00 IST)

How these were made: production build (`run-local.sh --prod`) on my worktree stack, seed data, logged in as admin@aurum.test. Shots are viewport-only (1440×900, 768×1024, 390×844) under `docs/overnight/shots/admin/<page>-<width>.png`. Each page was scored twice by a fresh-context `ui-critic` (judging only the screenshots), once mid-night and once on the final build; the score below is mine after reading both and the shots, and it is not higher than the second critic's unless a fix landed after that pass (noted).

Scale: 9 = a strong startup design team would ship it as is; 10 = Attio level. Compared with Attio (records, tables) and Stripe (money, webhooks).

| Page | Score | Shots | What holds it back |
|---|---|---|---|
| Home | 8.5 | `home-1440.png`, `home-768.png`, `home-390.png` | Activity rail repeats the newest attention items (same events, different view); attention rows open the record but carry no inline action. |
| Visits list | 8.5 | `visits-1440.png`, `visits-768.png`, `visits-390.png` | Long shop names still truncate at 1440 ("Batra Gold & Dia…"); planned rows leave Distance/Proof/Duration blank. |
| Visit record (in visit) | 8.5 | `visit-1440.png`, `visit-768.png`, `visit-390.png` | Verdict appears in the panel and the Location strip (the one remaining repeat). |
| Visit record (planned) | 8.5 | `visit-planned-1440.png`, `-768`, `-390` | Lower half is empty until the agent arrives — honest, but sparse. |
| Agents list | 8.5 | `agents-1440.png`, `-768`, `-390` | Fine; current-visit text can still truncate with long shop names. |
| Agent record | 8.5 | `agent-1440.png`, `-768`, `-390` | Route map does not always fit every stop (shared `JrMap` fit runs once); "Orders today" sub-line now says "3 all time" (fixed after the second critic pass). |
| Shops list | 8.5 | `shops-1440.png`, `-768`, `-390` | Name/area truncate for the longest names; compact ₹ in the table vs full ₹ on the record is deliberate but noticed. |
| Shop record | 9 | `shop-1440.png`, `-768`, `-390`, `shop-in-visit-1440.png` (+768/390) | Credit position is the strongest block; memo value told once; samples value heads its own list; Highlights only appear for what nothing else shows (last order); a live visit reads "In visit now · Arjun Singh · since 5:07 am". Left: the Last-order sub-line truncates its status. |
| Orders list | 9 | `orders-1440.png`, `-768`, `-390` | Review action in the Status cell (visible at every width after the last fix); approval cell says why + who. Phone shows dot + Review, no label. |
| Order record | 8.5 | `order-1440.png`, `-768`, `-390` | The credit reason is still told by the verdict card and the panel's Approval row (panel persists across tabs, so kept). |
| Memos list | 8.5 | `memos-1440.png`, `-768`, `-390` | Due ("2 days overdue") and Status ("Overdue") overlap in meaning. |
| Memo record | 8.5 | `memo-1440.png`, `-768`, `-390` | The memo document and the panel both carry status, due and acknowledgement (panel persists across tabs); phone table now drops Design/Net wt so value and status are reachable. |
| Samples list | 8.5 | `samples-1440.png`, `-768`, `-390` | Nine columns at 1200 px: design names truncate; agent-held pieces now read "In the bag" instead of a clipped "Field bag · last…". |
| Sample record | 9 | `sample-1440.png`, `-768`, `-390` | Chip beside the tag, Extend due date on the overdue line, value in header + panel only, photo moves to the header thumb below lg. Overdue told in chip + due cell. |
| Catalog | 9 | `catalog-1440.png`, `-768`, `-390` | Strong; footer sums and the Making tooltip exist. Phone keeps design, purity, price, samples. |
| Integrations | 8.5 | `integrations-1440.png`, `integrations-failing-1440.png`, `-390` | Health reads "Enabled · failing: 2 retrying in 24 h" in the rows' own words; toggle labelled Enabled. At 390 the per-row Retry button sits off-screen. |
| Settings | 8.5 | `settings-1440.png`, `-768`, `-390` | Clean; history repeats "Priya Mehta" on every row; content narrower than other pages. |
| Not found (any record) | 9 | `not-found-1440.png`, `-768`, `-390` | Plain icon, one line, one way back. No title bar. |

## Below 9 and why it stayed there
- **Repeats on record pages (order, memo, visit):** the remaining duplicates are between the main column and the left panel, and the panel stays the same on every tab (Attio's model). Removing them from the panel would hide status/due/ack on the History and Activity tabs. A per-tab panel would fix it properly; not attempted tonight.
- **Truncation in wide lists (visits, samples, shops):** nine or ten columns share 1200 px. The next step is user-resizable columns or hiding a column by default, not more width shuffling.
- **Home activity vs Needs attention:** both are true views of the same events. Filtering one by the other is a product decision (it would hide the timeline's newest rows).

## Critic findings checked and not acted on
- "The last column is clipped at 1440" — measured on every list: the table scroller's `scrollWidth` equals `clientWidth` (1200), nothing is cut; the last column just ends at the viewport edge.
- "Couldn't resolve that host" for an unresolvable webhook URL — not shipped on purpose: review m4 forbids a DNS oracle and `apps/api/test/egress.test.ts` asserts the message never mentions resolution.
