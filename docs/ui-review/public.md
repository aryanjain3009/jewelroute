# Public pages — UI review rounds (`/`, `/developers`, `/login`, `/ack/[token]`)

Design authority: emil-design-eng. References: live Attio marketing site (captures in `scratchpad/attio-landing/`), Stripe docs
(`docs.stripe.com/api/authentication`, `/webhooks`, captured to `scratchpad/ui/public/ref/`). Refero MCP was not connected.
Screens: `scratchpad/ui/public/{r0,r1,r2,r3,r4,final}/` at 390 / 768 / 1440 (script `scratchpad/pubui/shots.mjs`).
Scores: hierarchy · spacing · typography · interaction · density · consistency · responsiveness · polish → overall.

## Round 0 — baseline (landing v4, previous /developers, /login, /ack)
| Page | H | S | T | I | D | C | R | P | Overall | Weakest |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 8 | 8 | 8 | 6 | 8 | 8 | 8 | 8 | **7.5** | No `Manager · Field Agent · Sample Custody` switch; no verified-visit section; custody not the strongest visual; Home shown twice (hero + manager) |
| `/developers` | 6 | 7 | 6 | 5 | 7 | 6 | 7 | 6 | **6** | Single long column, serif headings, no code/prose split, no highlighting or copy, event list without payloads |
| `/login` | 6 | 7 | 7 | 6 | 7 | 7 | 7 | 6 | **6.5** | Rahul/Priya choice a small afterthought under the form; no device cue |
| `/ack/[token]` | 7 | 7 | 7 | 7 | 7 | 7 | 8 | 6 | **7** | Agent → shop hand-over unclear; receipt plain; expired/invalid states bare |

## Round 1 — rebuild (r1/r2)
- `/`: hero switch (Origin comp-427 tabs on Radix + clip-path active layer, auto-advance with a linear progress line, pause on hover/focus/off-screen, stop on click, reduced motion = none); sections reordered to the brief (new `#visit`, showcase now Route and bag / Selling / Memos); custody = piece photo + four answers + ledger; manager section = Orders table + approval sheet.
- `/developers`: sticky grouped sidebar + phone "On this page" popover, Stripe two-column sections, code panel (tabs, copy, line numbers, tiny highlighter), event catalogue from `@jewelroute/shared` with the API's example payloads, retry ladder, errors table.
- `/login`: persona cards with live previews (phone/laptop) on desktop, persona rows on phones, form unchanged.
- `/ack`: brand bar, hand-over, due/net-gold facts, pieces, total, code, pinned confirm, receipt with perforation, problem states.

| Page | Overall | Found next to the references |
|---|---|---|
| `/` | 8.5 | Switch text smeared on hover-active (hover colour applied to the active trigger); tabs flush to the screen edge at 390; hero custody frame cramped at 390/768; proof card covered the map label; low-accuracy icon rendered as a dot |
| `/developers` | 8.5 | Formula overflowed; long code lines; `Example →` arrow text |
| `/login` | 8 | Nested `<button>` (hydration error: app buttons inside the card button); three equal ink buttons competing |
| `/ack` | 8.5 | Shop name truncated in the hand-over row at 390; expired copy suggested reading a code that is also expired |

## Round 2 — fixes (r3/r4)
| Fix | Why |
|---|---|
| Hover colours only on inactive tabs; keyboard-only focus ring (Radix focus reported `:focus-visible` on click) | Clean active pill, ring only for keyboard users |
| Tabs inside the page inset; container-query highlights in the custody frame (cards ≥ 440 px, rows below) | No edge-to-edge control, no wrapped memo numbers |
| Proof card below the map (photo + server facts), refused point moved inside the frame, `LocateIcon` | Nothing covers the shop label; icons read at a glance |
| Ledger seq badge on the date line, shorter "Signed for by QR" line | No wrapped badges in the three-column ledger |
| Formula wraps, Node/Python snippets reflowed under ~70 chars | No sideways scrolling for the key formula |
| Stretched transparent button over each persona card; outline CTAs | Valid HTML, form keeps the primary weight |
| Vertical From → To hand-over; expiry copy "open a new QR code" | Long shop names fit; honest guidance |
| Showcase flows stack below 1280 px (centred 560 px steps) | No cramped three-column flows at 768/1024 |
| Dev server OOM: final QA on one production build | Stable timings |

## Final round — production build (`final/`)
| Page | H | S | T | I | D | C | R | P | Overall |
|---|---|---|---|---|---|---|---|---|---|
| `/` (hero) | 10 | 9 | 10 | 10 | 9 | 10 | 9 | 10 | **9.5** |
| `/` (page) | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | **9** |
| `/developers` | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | **9** |
| `/login` | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | **9** |
| `/ack/[token]` | 9 | 9 | 9 | 9 | 9 | 9 | 10 | 9 | **9** |

Honest gaps: the hero is not a full 10 at 390 (the manager frame is a cropped, responsive Home rather than a purpose-built phone composition); the landing at 390 is long (~13k px) because each showcase flow stacks; the verified-visit list rows stretch tall at 1440.

## Checks (final)
- `overflow`: `scrollWidth == innerWidth` on every page at 390 / 768 / 1440; no console errors except the expected 401 (`/auth/me` on /login) and 404/410 on invalid/expired ack links.
- Gates: web typecheck, lint, production build exit 0. Playwright `landing` (9) + `field` `auth.spec` (11) + `public.spec` (3): 23 passed against the production build on :3301 / API :4301.

## Round 3 — after the independent critique (`docs/ui-review/critic-public-field.md`)
Critic scores going in: `/` 8, hero 8.5, `/developers` 8.5, `/login` 8.5, `/ack` pending 8.5.

| Critic item | Fix |
|---|---|
| ALL-CAPS eyebrow | Sentence-case link pill "Field sales operating system for jewelry ›" to `/#workflow` (13 px / 500) |
| Grey band cuts the mocks | The flat stage now starts at the switch's midline: every frame sits wholly on grey |
| 390 Manager crop clips "Overdue on memc" | Purpose-built phone crop: 2×2 numbers with wrapping labels, Needs attention, live activity |
| Tab labels change by width | "Manager · Field agent · Sample custody" at every width; 40 px segments on phones |
| "Sell and complete" overflows; empty phone | Step label "Sell"; final step shows the visit's order and memo |
| Dead whitespace in Verified visits | Heading moved into the left column; the four outcomes are vertical tabs (Radix) that switch the map and the server record (verified, low accuracy halo, simulated, refused with "nothing written") |
| SKU breaks mid-token | SKU on its own line, `whitespace-nowrap` |
| 390 menu without backdrop, 36 px toggle | Full-width sheet under the header with a scrim; 44 px toggle and 44 px links/buttons |
| Manager-ops frame pops in | Rendered eagerly (no reveal) |
| 401 from the session probe | `/login` probes `/auth/me` only when a session cookie exists |
| `/developers` example payloads disagree | All 18 payloads are real outbox events captured after driving every flow through the API (`components/public/docs/examples.ts`); the delivery body and the approval credit JSON use the same events |
| Weak selected event | `bg-selected` + 2 px ink rule; mono event name in the panel title |
| 28 px targets on mobile | Copy buttons 36 px (44 px hit area), language tabs 36 px, catalogue rows ≥ 44 px |
| `→` glued to button text on /login | Removed; rows end in a chevron in its own cell |
| Choice weak below 1280 | Each row carries a 56 px thumbnail of its screen (phone Today / laptop Home) |
| Form floats | Form top-aligned with the left headline |
| /ack total and code hidden by the bar | Total in the pinned bar; the six-digit code moved above the pieces |
| Title orphan; "Net gold" | `text-balance`; "Net weight" |

| Page | Overall (final2, production build) |
|---|---|
| `/` hero | **9.5** — the 390 manager crop is still a window that ends mid-list |
| `/` page | **9** |
| `/developers` | **9** |
| `/login` | **9** |
| `/ack` pending / confirmed | **9 / 9.5** |

Gates: typecheck, lint, production build exit 0; Playwright landing 9, auth 11, public 3 passed on the production build.
Screens: `scratchpad/ui/public/final2/`.
