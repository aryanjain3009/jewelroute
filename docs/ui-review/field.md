# Field app UI review (ui-field branch)

Design authority: emil-design-eng (motion under 300 ms, strong ease-out, press feedback, reduced motion via the global rule). Reference: native iOS/Android patterns with Attio's restraint; DESIGN.md v2 field rules (56 px tab bar + safe area, 44 px targets, primary action in the bottom 40%).
Screenshots: `scratchpad/ui/field/r0` (baseline) … `r3` (final), at 390 (primary), 768 and 1440.

## Round 0, baseline
| Page | Hier | Space | Type | Interact | Density | Consist | Resp | Polish |
|---|---|---|---|---|---|---|---|---|
| Today | 8 | 8 | 8 | 7 | 7 | 8 | 8 | 7 |
| Active visit | 6 | 7 | 8 | 7 | 6 | 7 | 8 | 6 |
| Sale workspace | 6 | 7 | 8 | 7 | 7 | 7 | 8 | 7 |
| Catalog | 8 | 8 | 8 | 7 | 8 | 8 | 8 | 8 |
| Visits | 8 | 8 | 8 | 7 | 8 | 8 | 8 | 7 |
| Profile | 7 | 8 | 8 | 7 | 7 | 8 | 8 | 7 |
Weakest: the active visit showed no live credit (only the limit, at the bottom); the sale screen looked like the catalog with a tab; hand-rolled segmented controls; no press feedback; disabled Check in with no way forward when location was denied.

## Round 1
Shared primitives in `components/field/bits.tsx` (Notice, TapRow, Segmented on Radix Tabs, ShopMoney, FieldEmpty, PRESS). Visit: live credit strip (`GET /visits/:id/credit` under `qk.credit`), one evidence row (photo + how the check-in was located), two-up Create order / Leave on memo, timeline dots by kind. Sale: retailer context, cart bar slides up once. Receipt rebuilt as a real receipt.
Found: bottom spacer rendered mid-page on check-in/photo stages; "Planned … Planned 10:30"; map label under the GPS dot; icon boxes on tiles; four rows of chrome above the first product.

## Round 2
Spacers moved to the page end; marker label only when the agent's dot can't sit on it; plain icons on tiles; one-row retailer strip with the number that matters per mode (available credit for orders, on-memo value for memos); one-line rate well. Denied location: the bottom action becomes the labelled "Simulate arrival (demo)" (info tone, never ink/verified) instead of a dead Check in.
Found: due presets wrapped; "Browse only" label; completed visits truncating areas; profile meta ambiguous.

## Round 3 (final)
Due presets as a 4-column ToggleGroup; completed visits use the check mark; profile memo rows two-line; ack waiting pill; pending-ack line above Complete visit shortened.

| Page | Hier | Space | Type | Interact | Density | Consist | Resp | Polish | Overall |
|---|---|---|---|---|---|---|---|---|---|
| Today | 10 | 10 | 10 | 10 | 9 | 10 | 10 | 10 | 10 |
| Active visit | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 9 | 10 |
| Sale workspace (catalog, cart, review, receipt) | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| Memo pick / review / ack | 10 | 9 | 10 | 10 | 9 | 10 | 10 | 9 | 9.5 |
| Catalog browse + detail | 10 | 10 | 10 | 9 | 9 | 10 | 10 | 10 | 9.5 |
| Visits | 9 | 10 | 10 | 9 | 10 | 10 | 10 | 9 | 9.5 |
| Profile / bag | 9 | 9 | 10 | 9 | 9 | 10 | 10 | 9 | 9.5 |

## Shared changes requested (not made here)
- Sonner `<Toaster>` sits top-centre and covers the field top bar for ~4 s; on `/field` consider `offset` below the 48 px bar.
- `playwright.config.ts` field project regex `field.*\.spec\.ts` also matches any path containing "field" (e.g. a `wt-fieldui` worktree), pulling admin `manager-flow` specs into the phone project; anchor it to the file name (`/\/field[^/]*\.spec\.ts$/`).
- `jr/map` selected-marker label is centred on the point, so the agent's GPS dot sits on it when at the shop; an offset label (or `anchor: "bottom"`) would let the label always show.

## Round 4, after the independent critic (critic-public-field.md)
Fixed every field item:
- **Today:** numbered 22 px markers (opt-in `markerStyle="numbered"` in `jr/map`, admin unchanged), label only on the focused stop, GPS dot drawn under the markers; custody strip under the greeting with both values gold; "You're here" in green instead of "0 m away".
- **Visits:** one status vocabulary (dot + label); outcome on its own meta line, so areas no longer truncate; no lingering focus ring on the segmented control.
- **Active visit:**
  - Create order is the ink primary in the thumb zone, with Leave on memo next to it, until an order, memo or return is recorded. After that, Complete visit takes over; before that it is an outline button in the content.
  - Before check-in the panel says "You're at {shop}" once ("verified" is reserved for the recorded check-in).
  - The fence is warn-toned when outside, and the memo icon is no longer gold.
  - The top bar says "Stop N".
  - Order chips are dropped wherever a decision box already explains the status.
  - Location blocked uses the warn tone.
- **Sale:** no bag badges in Order mode; the detail sheet pins "₹… incl. GST" above its CTA; generic placeholders; neutral selected fill for memo rows; terminal steps scroll to the top; the chip row has an edge fade.
- **Catalog:** the rate line reads "as of 1:28 am, 22 Oct".
- **Profile:** the bag shows the first 4 pieces with "Show all"; the overdue memo is shown once (in its row); the count is ink.
- **Toasts:** pushed visit screens show toasts just under the top bar, because the bottom-centre toast covered the sticky Check in button.
Spec: the pre-check-in label changed from "Location verified" to "You're at Sharma Jewellers" (`field-flow.spec.ts`, label only).

| Page | Overall |
|---|---|
| Today | 9.5 |
| Visits | 9 |
| Active visit | 9.5 |
| Sale order | 9.5 |
| Sale memo | 9.5 |
| Catalog | 9 |
| Profile | 9 |
