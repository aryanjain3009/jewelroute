# JewelRoute UI — pages, how they were built, libraries

One Next.js 15 app (App Router, TypeScript) serves everything. It has three audiences:
- **the public**: landing page, developer docs, retailer acknowledgement;
- **field agents**: phone-first `/field/*`;
- **managers**: laptop-first `/admin/*`.

There are **13 routes**. Every screen talks to the real NestJS API; nothing is mocked.

## Pages

### Public

**1. `/` Landing page**
- **Hero:** the headline "Know where every salesman went, what he sold, and where every gram is." Below it, a live custody trail for one sample (22K Rajwada bangle, AJ-S-000123, 24.50 g) moving Vault → Rahul (field bag) → Sharma Jewellers, Karol Bagh. Each hand-over shows its evidence: who issued it and the bag value, the GPS fence check ("Location verified · 38 m") with the arrival photo, and the memo number with due date and the retailer's confirmation code. The trail plays once on load, has a "Replay the hand-over" button, and respects reduced motion.
- **Five feature sections, each built from real product UI rather than icons or stock photos:**
  - GPS-verified visits: a fence diagram with the in/out states;
  - proof-of-custody memo: the piece list, the QR code and the 6-digit code;
  - gold-rate pricing: a design card with the full price breakdown;
  - command centre: the metric strip plus the activity feed;
  - webhooks: a signed payload and the delivery log.
- **"How a day runs":** a four-step timeline (morning issue → visits → memo and order → evening reconciliation).
- **Trust section:** tenant isolation, append-only custody ledger, audit trail, signed webhooks.
- **Closing call to action and footer.** There are no invented customer logos or testimonials.

**2. `/developers` API and webhook docs**
- Sticky left navigation, with sections for authentication, idempotency keys, the error envelope and the key endpoints.
- The webhook event catalogue (11 events), the payload format, the signature scheme (`X-JewelRoute-Signature: sha256=HMAC(secret, timestamp.body)`), and the retry ladder (1 attempt + 6 retries, then dead letter).
- Verification code in Node and Python, and a link to the live Swagger UI.

**3. `/ack/[token]` Retailer acknowledgement** (public; opened by scanning the agent's QR code)
- Tenant name, shop, agent, memo number and due date.
- Every piece left on memo, each with photo, tag code, purity, net weight and value, plus the total.
- A large **Confirm receipt** button, and the 6-digit code to read out to the agent.
- After confirming, a receipt-style confirmation. Invalid and expired links get their own clear states.

**4. `/login`**
- Email and password form.
- Two clearly labelled one-tap demo buttons: "Sign in as Rahul (field agent)" and "Sign in as Priya (manager)".
- Sends field agents to `/field/today` and managers to `/admin`, and returns to the page you came from when you were sent to log in.

### Field app (phone-first: 375 px, sticky bottom action bars, 44 px touch targets)

**Shared top bar:** agent name, date, bag value (pieces in custody, shown in gold), sign out. (`/field` itself just redirects to `/field/today`.)

**5. `/field/today`: "What do I do next?"**
- Progress: "1 of 4 visits done", with a progress bar.
- Map of today's route with numbered stops joined by a dashed line, plus the agent's live position.
- **Next stop card:** shop, area, live distance from the phone's GPS, status, an active-memo indicator, **Start visit**, and **Navigate** (opens Google Maps directions).
- Two figures: "In your bag" (pieces and value) and "Out on memo" (value, plus the overdue count in red).
- The ordered route list, Linear-style: number, name, area, distance and status for each stop.

**6. `/field/visits/[id]` Active visit**, the core screen, in three states:
- **Before check-in:**
  - Retailer header: name, owner, tap-to-call phone, address.
  - Map with the shop, a **geofence circle** and the agent's position.
  - Large live distance.
  - The server re-checks the fence every 5 s while the agent moves. Inside the fence it shows "✓ Location verified — 30 m" in green; outside, "You're 234 m from Sharma Jewellers. Check-in opens within 100 m." and the button is disabled.
  - Handles GPS denied, unavailable and retrying.
  - In demo tenants only, a clearly labelled **Simulate arrival (demo)** link, recorded as SIMULATED everywhere.
- **Visit proof (immediately after check-in):** **Take photo** opens the rear camera from the browser; **Upload photo** picks a file. In the browser the photo is:
  - downscaled to 1600 px JPEG;
  - SHA-256 hashed;
  - stamped with the current GPS position;
  - then uploaded.

  The proof card shows the photo, time, shop, "GPS verified · 30 m from shop" and the short checksum.
- **Workspace (after check-in):**
  - Attio-style retailer record: owner, phone, credit limit, area, shop code.
  - Previous orders, active memos at this shop (due status and outstanding value), and the last visit.
  - Six actions: **Show catalog**, **Book order**, **Leave on memo**, **Return memo** (bottom sheet listing the open memo pieces), **Add note**, **Complete visit** (disabled until a photo exists, with the reason shown).
  - A visit timeline of check-in, photo, order, memo, acknowledgement and notes.
  - **Show QR again** for a pending acknowledgement.
  - Completed visits become read-only.

**7. `/field/visits/[id]/sale` Catalogue and sale workspace**
- Today's gold-rate strip (22K / 18K / 24K ₹/g, with "as of" time).
- Search, category chips, collection select, purity toggle and weight range.
- Large photo grid (2 columns on phone, 4 on desktop). Each card shows name, purity tag, weight and today's price, plus a badge such as "1 in your bag" when the agent is carrying a sample of it.
- **Design detail** (bottom drawer on phone, side sheet on desktop):
  - large photo, name in the Newsreader serif, SKU, collection, gross and net weight;
  - **price breakdown**: gold value (net g × today's rate), making charge (per gram or %), stones, other components, unit price, GST 3%, and the **total** in gold.
- An **Order / Memo** switch:
  - **Order:** quantity stepper, cart, sticky bar showing items, grams and total. On review, **Place order** shows a success screen with the order number. One idempotency key per review, so a retry can never create a second order.
  - **Memo:** choose the exact physical pieces by tag code from the agent's bag. On review: due date (quick 3/5/7-day chips or a calendar) and notes.
    - Then the **retailer acknowledgement** screen: a QR code to scan, a 6-digit code entry box, and a check every 3 s until it flips to "Acknowledged by Sharma Jewellers at 11:42 am".
    - Finally: "2 pieces · ₹8.2L now with Sharma Jewellers".

### Manager app (laptop-first: 1280–1536 px; still usable on a tablet)

**Shared shell:**
- left rail: Command centre, Visits, Orders, Memos & samples, Settings, API docs;
- top bar: tenant name and date, today's 22K rate chip, "Open field app", user menu.

**8. `/admin` Command centre** (refreshes every 10 s)
- **Metric strip** (Ramp-style, divided by hairlines): Orders today, Visits completed / planned, Samples outside, Memo value outside, Overdue memo value, Pending approvals. Only overdue and pending turn red/amber, and only when they're above zero.
- **Large map** of today's field activity:
  - shops coloured by visit status: planned, in visit, completed, missed or no visit today;
  - GPS check-in points;
  - badges for pieces on memo at each shop;
  - a legend.

  Click a shop to open its visit.
- **Live activity feed:** "Rahul checked in at Sharma Jewellers · 38 m", "uploaded visit proof", "booked ORD-2026-00039 · ₹6.57L", "left 2 samples on MEMO-…", "Memo … overdue". Each row has an icon, relative time and amount; new rows slide in.
- **Exceptions** with actions:
  - orders awaiting approval (approve, or reject with a reason);
  - overdue memos (extend the due date);
  - missed visits (reassign).
- **Agents today:** each agent's progress bar, bag value, sold value and current location.
- **Side sheets instead of extra pages** (every row, map marker and feed item opens one, with Back navigation):
  - **Visit:** agent, GPS check-in with distance and verification badge, the proof photo with capture time, coordinates and checksum, orders, and memos with the exact pieces and due date.
  - **Order:** items, plus the gold-rate snapshot the order was priced at.
  - **Memo.**
  - **Piece custody history:** the full ledger of who held the piece, and when.

**9. `/admin/visits`**, **10. `/admin/orders`**, **11. `/admin/memos`**
- Dense, filterable tables (status, agent, date) that open the same side sheets.
- The memos page leads with **"Where every piece is"**: every piece grouped by vault, field bag or shop.

**12. `/admin/settings`**, five tabs (the active tab is kept in the URL):
- **Gold rate:** current 24K / 22K / 18K with an inline form to set a new rate. The confirm dialog shows the effect ("prices for N designs update now; existing orders keep their snapshot"). Plus a sparkline and history table per purity.
- **Shops:**
  - table of code, name, area, coordinates, fence radius, memo value, pieces at the shop and last visit;
  - create/edit sheet with lat/lng, radius, and a small map preview of the fence;
  - **Assign visit:** agent plus date, which is step 4 of the success scenario.
- **Catalogue:** designs with images and today's price; edit sheet; the physical samples of each design with their current holder; **Add pieces**, **Issue to agent** and **Return to vault**.
- **Agents:** today's plan and progress, bag, last check-in, an active toggle, create agent, and add/remove visits on their route.
- **Integrations** (modelled on Stripe's developer settings):
  - endpoint list and Add endpoint (the secret is shown once);
  - masked secret with Reveal and Rotate;
  - event checkboxes with descriptions;
  - **Send test event**, with the result shown inline;
  - **delivery history**, refreshed every 5 s: event, HTTP status, latency, attempts, and a Delivered / Retrying / Dead letter badge;
  - delivery detail sheet: JSON payload with a copy button, the exact signed headers sent on each attempt, the attempt log and **Retry now**;
  - built-in test receiver panel with "Signature verified ✓";
  - Node verification snippet.

Every page also has loading skeletons, empty states that say what to do next, error states that carry the API's error message, and toasts after each action.

## How it was built

1. **Contract first.** `docs/CONTRACT.md` fixed every endpoint, response shape and error code before any UI work, so the API and two UI builders worked in parallel against the same document. `src/lib/types.ts` mirrors that contract.
2. **Design system before pages.** Written up in `docs/DESIGN.md`, with tokens in `globals.css`:
   - **Colours:** warm-white paper `#fcfbf8`, near-black ink `#191714`, hairlines `#e9e5dc`. One gold (`#b08a35` / `#85661f` for text) reserved for value: money, purity, custody. Strong colour only where action is needed: green verified, amber due-soon or retrying, red overdue, outside the fence, or dead.
   - **Type:** **Schibsted Grotesk** for the interface; **Newsreader** serif only for design names, big totals and landing headlines. Sentence case throughout.
   - **Layout:** no shadowed card grids, separated by hairlines and space; shadows only on things that float (sheets, popovers, map controls).
   - **Rules:** no gradients, no all-caps labels, no black-and-gold cliché.
3. **Reference patterns, not copied branding:**
   - Linear: dense lists, calm status badges;
   - Attio: the retailer record with an activity timeline;
   - Ramp: a money-first metric strip;
   - Apple and Shopify product pages: photo first, clear price hierarchy;
   - Stripe developer settings: the webhooks page.

   The Refero MCP mentioned in the brief wasn't available in this session, so these came from the brief's list rather than from live screen research.
4. **Shared building blocks** (`src/components/jr/`):
   - one `JrMap` used by both the field and manager screens (markers, fence circle, route line, live position);
   - status badges for every state machine;
   - `Money` (₹1,48,500 or ₹14.9L), `Grams` and `PurityTag`;
   - the logo.

   Pricing, distance and date logic come from `@jewelroute/shared`, the same code the API uses, so the two can't disagree.
5. **Data:** TanStack Query for all server state, with per-screen query keys, the right keys invalidated after each change, a 10 s poll on the command centre and 5 s on deliveries. A small `api()` client unwraps the response envelope, sends idempotency keys, and refreshes the session once on a 401. The browser only ever calls same-origin `/api/*`, which Next rewrites to the API, so the login cookies stay first-party.
6. **Verified in a real browser:** Playwright drove the full flows at 390 px and 1440 px, with geolocation set to just outside and just inside Sharma Jewellers' fence. The screenshots were reviewed and fixed. One fix example: Schibsted's tabular figures rendered like a typewriter, so the app uses proportional figures. The 26-step success scenario passes through these screens.

## Third-party libraries (web app)

| Library | Used for |
|---|---|
| **Next.js 15.5** + **React 19** | App Router, routing, middleware login gate, `/api` rewrite to the API |
| **Tailwind CSS v4** + `tw-animate-css` | Styling via design tokens |
| **shadcn/ui** (radix-nova style) on **Radix UI** primitives | Button, Input, Dialog, Sheet, Tabs, Table, Select, Popover, Checkbox, Switch, Tooltip, Skeleton, ScrollArea, Progress, ToggleGroup, Alert, Avatar, Badge: accessible, not hand-built |
| **vaul** | Phone bottom drawers on the field pages |
| **react-day-picker** | Memo due-date calendar |
| **input-otp** | 6-digit retailer code entry |
| **sonner** | Toasts |
| **TanStack Query v5** | Server state, caching, polling, mutations |
| **MapLibre GL JS 5** + **OpenFreeMap** tiles (OpenStreetMap data) | All maps: no API key or usage bill, unlike Mapbox or Google |
| **motion** (Framer Motion) | Only for responses to actions (check-in success, cart items, sheets, new feed rows) and the one landing-page sequence |
| **qrcode.react** | The memo acknowledgement QR code |
| **@vercel/blob** | Direct phone-to-storage photo upload with a short-lived token (when Blob is configured) |
| **lucide-react** | Icons |
| **clsx**, **tailwind-merge**, **class-variance-authority** | Class name composition and component variants |
| **next/font** (Google Fonts) | Schibsted Grotesk and Newsreader, self-hosted at build time |
| **Unsplash** | Catalogue jewellery photos in the demo seed (hotlinked URLs) |

**Installed but not used yet:**
- `react-hook-form`, `@hookform/resolvers` and `zod`: forms are small controlled components and the API validates with zod;
- `date-fns`: dates are formatted with `Intl` in IST;
- `cmdk` and `next-themes`: pulled in by shadcn components that aren't used.

They can be removed, or adopted when forms grow.

**From the suggested stack, deliberately not used:** GSAP (Motion covers the few transitions), Origin UI / 21st.dev (the shadcn primitives were enough), Mapbox / Google Maps (MapLibre needs no key).

Testing: **Playwright** (Chromium) for screenshots and end-to-end browser runs.
