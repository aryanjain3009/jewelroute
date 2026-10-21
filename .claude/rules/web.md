---
paths:
  - "apps/web/**"
---
# apps/web — prohibitions

Before your first edit under `apps/web/`, read `apps/web/AGENTS.md` and the **v2** section of `docs/DESIGN.md`. Verify UI changes with the `ui-verify` skill (390 and 1440 px).

**The UI never invents state**
- Show only what the API returned. Never compute custody, memo status, totals, verification or "synced" locally and present it as fact. Derived labels come from the shared helpers (`memoDisplayStatus`, `formatINR*`) applied to API data.
- No optimistic success for money, custody or check-in. Show pending until the response arrives, then render the response.
- Unknown is "—" or "No value", never `0`, `₹0` or a placeholder that looks real. A null `Design.price` means "no rate for this purity", not free.
- No fixtures, Lorem or fake totals in shipped pages. The landing page may describe features but never show invented live numbers as real.
- `SIMULATED` check-ins are labelled as simulated everywhere. Never render them as verified.

**Query keys and invalidation live in one place: `apps/web/src/lib/sync.ts`.**
- Use the `qk` key factory for every query; never invent ad-hoc keys.
- Every mutation calls `useSync()(change)` with the matching `Change` (`order.created`, `memo.created`, `piece.moved`, `gold_rate.set`, …). The `AFFECTS` map decides which screens refetch, so one memo updates Memo, Sample, Shop, Visit, the agent's bag, Home and Activity together.
- A new query key or a new kind of write adds a row to `AFFECTS` in the same change.
- Live screens poll (Home 10 s, deliveries 5 s); everything refetches on window focus.

**DESIGN.md v2 (Attio chrome)**
- Inter, 14 px base, 13 px meta, 12 px badges, weights 400/500/600 only. Page titles 14–15 px weight 500, not marketing-sized. Newsreader only for catalog design names, landing headlines and the ack page title.
- Neutral chrome. Gold (`#b08a35` / `#85661f`) only for money totals, purity and custody/samples, never for buttons or decoration. Primary buttons are ink.
- Hairlines (`#ececec`) instead of shadows. No resting card shadows, no gradients, no glass or blur, no big cards.
- Tables: 40 px rows, 36 px header, numeric columns right-aligned, status = dot + label or a soft chip. Buttons 32 px, radius 8.
- Sentence case. No ALL-CAPS eyebrows, no decorative numbering (route order is a real sequence, so it may be numbered), no `→` glued to button text.
- Motion only for panel open/close (150–200 ms ease-out), feed row insertion and selection bars.
- Field: bottom tab bar 56 px + safe area, 44 px targets, primary action in the bottom 40% of the screen.

**Numbers**
- **No tabular figures.** Never add `tabular-nums`, `font-variant-numeric: tabular-nums` or `"tnum" 1`. Numbers use `.num` (lining, proportional) and align by right-aligning the column (`docs/brain/learnings.md` L0001).
- Indian grouping (`₹1,48,500`); compact only via `formatINRCompact` (`₹48.5K`, `₹14.9L`, `₹1.2Cr`), never M/B or `Rs.`. Dates "21 Oct", times "11:42 am" IST.
