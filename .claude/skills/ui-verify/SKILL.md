---
name: ui-verify
description: Use when you changed anything visible in apps/web (pages, components, styles, copy) or are asked "does this look right / check the UI". Screenshot loop with Playwright MCP at 390 px (field/phone) and 1440 px (admin/laptop) against localhost:3000, judged against docs/DESIGN.md v2 and .claude/rules/web.md, fixing the top 3 issues per round, max 3 rounds. Not for API behaviour (tdd) or pure logic.
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# ui-verify — look at it, at both widths, against the spec

## Done when
- For every route you touched: screenshots at **390×844** and **1440×900** saved under `.artifacts/playwright/<route-slug>-<width>.png` (gitignored), taken after the data loaded.
- Each screenshot was checked against the checklist below, and the findings were listed with the screenshot path.
- The top 3 issues per round are fixed and re-shot. ≤3 rounds, then report what is left.
- `pnpm --filter @jewelroute/web typecheck` and `pnpm --filter @jewelroute/web lint` exit 0.
- Reported: route · width · path · pass or the remaining issues.

## Gotchas
- **Servers:** web on :3000 (`pnpm dev:web`) proxies `/api` to the API on :4000 (`pnpm dev:api`). Check both first: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` and `curl -s http://localhost:4000/v1/health`. Another agent may already be running them. Do not start a second copy on the same port.
- **Login:** the MCP browser is isolated (no cookies). Log in through `/login` each session: manager `admin@aurum.test` / `Aurum@2026`, agent `rahul@aurum.test` / `Rahul@2026` (seed data, not secrets).
- **Origins:** only `http://localhost:3000` is allowed, so OpenFreeMap tiles do not load and maps render empty (L0007). Judge the map chrome, markers and legend, not the tiles.
- **Browser:** if `browser_navigate` says chrome-for-testing is not installed, run `npx -y @playwright/mcp@0.0.83 install-browser chrome-for-testing` or export `PLAYWRIGHT_MCP_EXECUTABLE_PATH` before starting Claude (L0012).
- Wait for data: TanStack queries load after first paint. Use `browser_wait_for` with a text you expect (a shop name like "Sharma Jewellers") before the screenshot. Skeletons in a final screenshot are a finding.
- Field routes (`/field/*`) are judged at 390 first; admin routes (`/admin/*`) at 1440 first. The other width must still not break: no horizontal scroll, no overlapped text.
- Screenshots are evidence, not deliverables. Never commit them.

## Checklist (DESIGN.md v2 + web rules)
1. **Truth:** every number, status and name on screen comes from the API. No `₹0` for unknown values, no placeholder totals. Simulated check-ins are labelled. A null price shows as "no rate", not free.
2. **Money:** Indian grouping, compact only via `formatINRCompact`, right-aligned numeric columns, `.num` figures (**no tabular-nums**, L0001). Gold colour only on value (totals, purity, custody/samples).
3. **Type and density:** Inter, 14 px base, 13 px meta, weights 400/500/600. Small page titles (14–15 px / 500). Table rows 40 px, header 36 px. Buttons 32 px with radius 8.
4. **Chrome:** 240 px sidebar on admin. Hairlines, not shadows. No gradients or glass. Sentence case, no ALL-CAPS eyebrows, no decorative numbering.
5. **Field:** bottom tab bar 56 px + safe area, 44 px touch targets, primary action in the bottom 40%, one dominant next-visit row, no horizontal scroll at 390.
6. **States:** empty state = icon + one line + one button. Errors say what happened and what to do ("You're 214 m from Sharma Jewellers…"). Loading does not shift the layout.
7. **Motion:** only on panel open/close, feed insertion and selection bars (150–200 ms).

## Steps
1. List the routes affected by your diff (`git diff --name-only` → `app/**/page.tsx` and the pages that use changed components).
2. Check that the servers are up (Gotchas). Log in as the right role with `browser_navigate` + `browser_type`/`browser_click` on `/login`.
3. For each route and width: `browser_resize` (390×844 or 1440×900) → `browser_navigate` → `browser_wait_for` the expected text → `browser_take_screenshot` with `filename: ".artifacts/playwright/<slug>-<w>.png"` and `fullPage: true`. Also take `browser_snapshot` (accessibility tree) for text and role checks.
4. Read each screenshot (Read the PNG) and walk the checklist. For a non-trivial page, spawn `ui-critic` with the paths and the checklist instead of self-grading.
5. Fix the top 3 issues (truth > money > layout breakage > density > polish). Re-shoot only the affected route and width.
6. Repeat ≤3 rounds. Run web typecheck + lint. Report the table and the remaining issues.

## Related
- Agent: `ui-critic`. Rules: `.claude/rules/web.md`. Spec: `docs/DESIGN.md` (v2 section).
