# Landing page — reference lock and decision ledger

Scope: `/` (`apps/web/src/app/page.tsx`, `apps/web/src/components/marketing/**`), shared header/footer with `/developers`.
Design authority: `emilkowalski/skills → emil-design-eng` only. Product look inside frames: `docs/DESIGN.md` v2.

## v5 — public pages refinement (2026-10-22)
Brief order is now exact: **1 Hero · 2 Product showcase `#product` · 3 Verified visit `#visit` · 4 Sample custody `#custody` · 5 One field day `#workflow` · 6 Manager operations `#manager` · 7 Integrations `#integrations` · 8 Trust + CTA `#trust`**.
- **Hero switch** `Manager | Field Agent | Sample Custody` (`hero.tsx`, `ui/origin/segmented-tabs.tsx` = Origin comp-427 on Radix Tabs + emil clip-path active layer, 220 ms): Manager = admin Home, Field Agent = Today + the visit advancing check-in → photo → order → memo + the sale workspace (`PhoneSale`), Sample Custody = the sample record. Panels cross-fade with CSS transitions (enter 240 ms opacity/6 px/2 px blur, exit 140 ms), fixed stage height (no CLS). Auto-advance 6 / 8.6 / 6 s with a linear WAAPI progress line; pauses on hover, keyboard focus, off-screen, hidden tab; stops on the first click; off with reduced motion.
- **Showcase** = Route and bag / Selling / Memos (proof and custody have their own sections). Flows stack below 1280 px.
- **Verified visit** (`visit.tsx`): the four check-in outcomes as the API records them (VERIFIED, LOW_ACCURACY, SIMULATED, refused) beside the fence map and the server-stamped arrival proof.
- **Custody** (`custody.tsx`): piece photo, tag, purity, weights, value; four answers (where, who, why, when back); the Origin timeline ledger drawing hop by hop.
- **Manager operations** (`manager.tsx`): Orders table + approval sheet with the credit position (the hero already shows Home).
- Nav: Product · Visits · Custody · Workflow · Developers. Review rounds and scores: `docs/ui-review/public.md`.

## v4 — Attio landing reference (2026-10-21)

Refero MCP was not connected in this session, so the reference is the live Attio marketing site, captured with
Playwright at 1440 / 768 / 390 (viewport + full page) and measured with `getComputedStyle`:
`attio.com/`, `/platform/data`, `/platform/reporting`, `/platform/developers`
(screens: `scratchpad/attio-landing/*.png`, numbers: `scratchpad/attio-landing/measure*.json`). Nothing of Attio's
branding, copy, logos or assets is used.

### Measured values (Attio, 1440 px)
| Thing | Attio | JewelRoute v4 |
|---|---|---|
| Canvas / ink | white, ink ≈ `#1a1a1c` | `#fff`, ink `#1c1d1f` |
| Rails | content between two 1 px hairlines at x = 24 and 1416 (1392 wide), section dividers full-bleed | `RAIL` = `max-w-[1392px] lg:border-x` + full-bleed `border-t` per section |
| Content inset | ≈ 58 px inside the rail | `INSET` = 20 / 32 / 56 px (`px-5 sm:px-8 lg:px-14`) |
| Nav | 67 px (below a promo bar), links 15 px / 500 in 36 px hit areas, radius 10; Sign in = bordered 36 px, primary = ink 36 px | Origin navbar, 64 px sticky, links 15 px / 500 in 36 px, radius 10; Sign in bordered, Explore live demo ink; ≤1023 px hamburger popover |
| H1 | Inter Display 64 / 60.8, 600, −1.28 px, centred | Inter 60 / 60, 600, −0.03em, centred; 48 at sm, 34 on phones |
| Hero sub | 18 / 23.4, 500, grey | 18 / 1.45, 500, ink-2, max 580 px |
| Hero CTAs | 36 px, radius 10, outline left + ink right, centred | same (`See how it works` outline, `Explore live demo` ink) |
| H2 | 40 / 44, 500, −0.4 px, two-tone (claim in ink, explanation in grey) | `Heading` 40 / 44, 500, −0.016em, two-tone ink / ink-2 (28 → 34 → 40) |
| H3 (feature) | 24 / 27.6, 500, two-tone | `Heading size="md"` 24 / 1.15, 500, two-tone |
| Bento cell title | 16–18 px / 500 + grey continuation | 16 px / 500 + ink-2 continuation |
| Section rhythm | ~128–200 px from divider to H2, stage panels flush to dividers | `pt-20 md:pt-28 lg:pt-32` to the eyebrow, stages flush to hairlines |
| Product frame | 12 px radius, `rgba(0,0,0,.05)` border, no shadow, grey title bar with dots | `AppWindow`: radius 14, `#e3e3e3` border, `#f4f4f5` title bar, three grey dots, inner app radius 10, no shadow; only the floating phone and custody card carry one soft float shadow |
| Stage | flat `≈#f8f8f9` panels holding white cards (radius 12, border `rgba(0,0,0,.06)`) | `Stage` = `bg-sunken #f7f7f8`, `Card` radius 12, hairline `#ececec` |
| Feature index | sticky left column (≈350 px) with a 2 px active bar | Origin comp-444 adapted to a scroll-spy `SectionNav`, 296 px column |
| Footer | link columns (13–14 px), muted column titles, bottom legal row | light footer inside the rails: logo + 4 link columns + sample-data note |

### Which Attio pattern each JewelRoute section reproduces
| # | JewelRoute section | Attio pattern |
|---|---|---|
| 1 | Navbar (`site-chrome.tsx` → `ui/origin/navbar.tsx`) | Attio top nav proportions; Origin comp-577 mechanics |
| 2 | Hero (`hero.tsx`) | Centred eyebrow pill → H1 → grey sub → outline+ink CTAs → large app window that sits across a white/grey split; extra cards layered over the frame like the data-model page |
| 3 | Product showcase `#product` (`showcase.tsx`) | Home "platform" block: sticky left index, two-tone H3, grey stage with real UI, two-cell bento under each stage |
| 4 | Custody hero `#custody` (`custody.tsx`) | Centred section head over one large record frame (the "Live from day one" record), with a horizontal timeline |
| 5 | One field day `#workflow` (`field-day.tsx`) | Changelog strip: dated columns on hairlines |
| 6 | Manager view `#manager` (`manager.tsx`) | Centred two-tone claim over a full-width app frame cut by the next hairline; three short statements below |
| 7 | Integrations `#integrations` (`integrations.tsx`) | "SDK. API. MCP." split: claim + button left, one diagram right |
| 8 | Trust + CTA `#trust` (`closing.tsx`) + footer | Hairline statement row, then a big centred closing line with two buttons |

### Components (library first)
- **Origin UI** (`shadcn add https://coss.com/origin/r/…json`): comp-577 navbar → `ui/origin/navbar.tsx`; comp-444 vertical tabs → `ui/origin/section-nav.tsx` (scroll-spy index); comp-536 → `ui/timeline.tsx` primitive (custody ledger) and `ui/navigation-menu.tsx`. The CLI's overwrite prompts for `button`, `popover`, `tabs` were declined so the app's shadcn files are unchanged. Imports use `@/lib/utils`. One fix in `ui/timeline.tsx`: Origin's `TimelineIndicator` accepted `asChild` but ignored it (lint warning) — it now uses `Slot` like `TimelineDate`.
- **shadcn/ui + Radix**: `Button`/`buttonVariants`, `Popover` (mobile menu), `NavigationMenu`.
- **App components reused for product visuals**: `AppSidebar`, `ManagerView`, `Feed`, `PhoneFrame`, `PhoneTop`, `Steps`, `VisitHead`, `FenceMap`, `Avatar`, `Chip`, `Dot`, `CountBadge`, `IconBubble`, `PurityTag`, all fed by `components/marketing/data.ts` (priced with the shared `priceDesign` / `orderTotals`).

### Demo data (matches the seed and the brief)
Rahul Verma · Sharma Jewellers, Karol Bagh (Rakesh Sharma) · AJ-S-000123 Rajwada Bangle, 22K, 24.50 g net,
₹2,72,563 = ₹2.73L at ₹10,525/g + ₹600/g making · MEMO-2026-00017 due 26 Oct, QR-acknowledged 11:59 am ·
ORD-2026-00042 at 11:51 am · Aurum Vault → Rahul (9:00 am) → Sharma Jewellers (11:58 am).
Every frame is `inert` + `aria-hidden` with an `sr-only` summary, carries a "Sample data" tag, and the hero/footer
captions say the screens are sample data, never live figures.

### Motion (emil-design-eng)
| Where | What | Timing | Reduced motion |
|---|---|---|---|
| Hero | Rahul's visit advances once: check-in → arrival photo → order → memo acknowledged; matching admin feed row gets the selection tint; custody card moves the holder Rahul → Sharma | crossfade + 6 px rise, 240 ms `cubic-bezier(.23,1,.32,1)`, exit 120 ms; 2.6 s between states, stops at the end | final state rendered, no movement |
| Custody record | ledger connectors draw hop by hop (`scale` from the start edge) when first in view | 280 ms strong ease-out, 320 ms apart | drawn complete |
| Manager frame | one entrance | opacity + 12 px rise, 280 ms, once | duration 0 |
| Buttons | press feedback | `scale(.97)`, 150 ms ease-out (only `scale`/colours transition) | — |
| Mobile menu | Origin popover, origin-aware, hamburger morph | 200 ms ease-out (Origin's 300 ms overshoot curve removed) | — |
Everything else is static. `MotionConfig reducedMotion="user"` wraps the page. Only transform/opacity/colour animate.

### Deliberate deviations from `.claude/rules/web.md`
- The hero eyebrow is the brief's verbatim uppercase line (`FIELD SALES OPERATING SYSTEM FOR JEWELRY`), set small (11.5 px, +0.06em). It is the only uppercase text.
- Headlines are Inter (as Attio), not Newsreader. Gold stays on value, purity and custody only.
- Field-day times use the product format ("9:00 am", "11:42 am") rather than the brief's "09:00".

### QA (production build, `next start -p 3301`, Playwright 1440 / 768 / 390)
Screens: `scratchpad/landing-v4/final/{hero,full,sec-*,reduced-*}-{1440,768,390}.png`; script `scratchpad/pw/landing-v4.mjs`.
- 17 unique links on `/`: routes 200 (`/`, `/login`, `/developers`), every anchor exists (`/developers#events|signatures|money` too). No dead buttons: outside the inert sample frames the only `<button>` is the mobile menu trigger.
- `#product`, `#workflow`, `#custody` land at 64 px (directly under the sticky nav, `scroll-mt-16`).
- `scrollWidth == innerWidth` at 390, 768, 1440 (also checked 1024). CLS 0 at all widths (hero sequence included). No console errors or warnings.
- Keyboard sweep: every focus stop shows a ring. Reduced-motion emulation renders the final hero state and the complete custody ledger on first paint.
- `apps/web/e2e/landing.spec.ts` (project `landing`, no API needed): 6 passed.
- Gates: web typecheck, lint, build exit 0; `/developers` renders with the shared header at 390 and 1440 without overflow or errors.

### Side-by-side with Attio — refinement passes
| Round | Seen next to the Attio captures | Change |
|---|---|---|
| 1 | Admin metric labels truncated ("Overdue on memc") where the phone overlapped the frame; phone covered the metric row | Hero admin shows 4 metrics (all 5 stay in the Manager section); phone moved below the metric row and hangs into the grey stage like Attio's layered cards; reserved space so nothing collides |
| 1 | 768: desktop nav overflowed (794 px) | Navbar collapses to the Origin popover below 1024 px |
| 1 | 390: custody bento forced a 439 px column | `grid-cols-1` + `min-w-0` on bento cells |
| 1 | Phone step labels clipped at 300 px; "Acknowledged by QR · 11:59 am" wrapped into three lines | Phone back to the app's 320 px; time right-aligned, no wrap |
| 2 | H1 wrapped into five ragged lines on phones; Attio keeps one idea per line | Each sentence is its own block line; 34 → 48 → 60 px |
| 2 | Order number / time wrapped inside small fragments at 768 and 390; "check-in" broke at the hyphen in an H3 | `whitespace-nowrap` on identifiers and times, non-breaking hyphen |
| 2 | Attio's density vs ours: matched rail width, 40/44 two-tone headings, 36 px buttons, flat stages; our product frames are denser than Attio's (real 13–14 px app UI), which is the intent | — |
| 3 | A preload hint on the hero arrival photo produced "preloaded but not used" warnings (the photo appears at step 2) | Removed; console is clean |
