# Public and field UI scores (wt-public, 22 Oct 2026)

Bar: 9 = a strong startup team would ship it as is, 10 = Attio or Stripe. All shots come from the production build (`run-local.sh --prod`, :3200) after the last code commit and live in `docs/overnight/shots/public/` as `<page>-<width>.png` (390, 768, 1440). Field pages use a 520 px shell at 768 and 1440 by design.

Three columns, so nobody has to trust the builder: the critic's score from the start of the night (`docs/ui-review/critic-public-field.md`), a second independent `ui-critic` pass on this round's shots at 05:25 (before the last fixes), and my score now, after those fixes.

| Page | Critic, start | Critic, 05:25 | Now | Shots | What still holds it back |
|---|---|---|---|---|---|
| `/` landing hero | 8.5 | 7.5* | **9** | `landing-*.png`, `landing-hero-field-*.png` | Rotation: 240 ms transform + opacity, pauses on hover/focus/off-screen, stops for good on a click or tap, CLS < 0.01 and an identical frame box after a full cycle (e2e), no motion when reduced. *The 05:25 critic marked down a blank band in `landing-hero-field-390.png`; that is the sticky header over an element screenshot, not the page (see `landing-390.png`). Short of 10: the phone frame is a crop of the desktop app window rather than a phone-native story. |
| `/` whole page | 8 | 8 | **8.5** | `landing-*.png` | Mocks now follow the app's rules (no "verified" before check-in, numbered markers, amber fence when refused, no gold decoration, no glued arrows), "jewellery" spelling. Still very long at 390 and the product section's left rail is empty space at 1440. |
| `/developers` | 8.5 | 8.5 | **9** | `developers-*.png` | Real payloads with full cuids, clear selected event, 44 px targets. No language switcher or request runner (Stripe has both). |
| `/login` | 8.5 | 8 | **8.5** | `login-*.png` | "Create a workspace" link (44 px) under the form; one-tap demo rows with thumbnails. The 1440 thumbnails are too small to read and the form column is a lot of white. |
| `/ack/[token]` pending | 8.5 | 8.5 | **9** | `ack-*.png` | Total in the pinned bar, code above the pieces, "Net weight", balanced title. At 1440 it is a phone layout centred on a white page. |
| `/field/today` | 8.5 | 8.5 | **9** | `field-today-*.png` | Every stop on the map now (a style-load camera reset hid three of four), numbered circles ink / green / grey, label never under the GPS dot, "You're here", custody strip, toasts above the tab bar. Short of 10: the map pushes stops 3–4 to the fold at 390; "1 overdue" is not a link. |
| `/field/visits/[id]` planned + active | 8.5 | 7 / 8 | **9** | `visit-planned-*.png`, `visit-active-*.png`, `visit-photo-missing-390.png` | Neutral "You're at Sharma Jewellers" before check-in, "GPS verified, 20 m from the shop" after; fence centred and painted from the latest server verdict (stale-closure bug fixed); no duplicate Last order; Create order is the ink primary until something is recorded; a photo that won't load becomes a camera tile. |
| `/field/visits/[id]/sale` order | 8.5 | 7.5–9 | **9** | `sale-order-*.png`, `sale-detail-390.png`, `sale-cart-390.png`, `sale-review-390.png` | Total pinned above the sheet's bar ("incl. GST"), "Net weight", no quantity glued to the CTA, bag badges only in memo mode, every step opens at its top, 3 columns at ≥ 600 px. The review screen was the critic's best (9). |
| `/field/visits/[id]/sale` memo | 9 | 7 | **8.5** | `sale-memo-*.png` | Neutral selection, gold on values. The critic is right that a long bag list of gold prices is busy and that nothing at the bottom says what to do before the first pick; not changed tonight. |
| `/field/visits` | 8.5 | 8 | **9** | `field-visits-*.png` | One status vocabulary, money on the second line, keyboard-only focus ring. |
| `/field/catalog` | 8.5 | 8.5 | **9** | `field-catalog-*.png` | Rate line with date and time, chip edge fade, 3 columns at ≥ 600 px with a one-line weight. |
| `/field/profile` | 8 | 8.5 | **9** | `field-profile-*.png` | Bag shows 4 + "Show all 11 pieces", overdue told once, counts in ink. |

Under 9 and why they stay there tonight: the whole landing page (length at 390, empty rail at 1440: a layout change, not a fix), `/login` at 1440 (thumbnail legibility) and the memo picker (needs a bottom hint before the first pick and a quieter price column). Each is listed as open in the final report.
