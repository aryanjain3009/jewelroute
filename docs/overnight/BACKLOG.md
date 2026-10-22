# Overnight backlog (ranked: severity × user impact)

Status: `open` · `doing (owner)` · `done <hash>` · `dropped (why)`.
Owners: `lead` (main tree), `wt-conc` (concurrency worktree), `wt-admin` (admin UI worktree), `wt-public` (landing + field + public worktree).

| # | Item | Sev | Impact | Owner | Status |
|---|---|---|---|---|---|
| 1 | Self-serve signup: `POST /v1/auth/signup` → tenant + owner, `/signup` page, signed in on success | P0 | every new customer | lead | done 4822e02, 2f81e73 |
| 2 | Onboarding checklist (rate → design + piece → shop → agent → issue → plan visit) and a guiding empty Home | P0 | every new customer | lead | done 4822e02, 2f81e73 |
| 3 | Tenant isolation proof across 3 workspaces: lists, ⌘K search, activity, webhooks, ack link, file URL | P0 | trust | lead | done 4822e02 (S5) |
| 4 | Concurrency suite ×20 (9 races) with DB assertions: one custodian, contiguous seq, no dupes, credit consistent, outbox once | P0 | money and custody truth | wt-conc | done 06bb728 (C3, C6 found and fixed; CONCURRENCY.md) |
| 5 | Agent deactivation: what happens to planned visits, open visit and bag; new agent + new shop work end to end in the field app | P1 | ops | lead | done eb56953, d5bdd7c (S6, admin-signup e2e) |
| 6 | Home "Samples outside": header and rows use different value bases | P1 | number truth | wt-admin | open |
| 7 | Home greeting uses browser time, not IST | P1 | truth | wt-admin | open |
| 8 | Activity feed duplicates (order pending ×3, memo + piece.moved ×2) and wrong actor avatars for retailer acts | P1 | every record page | wt-admin | open |
| 9 | Failing webhook endpoint shows green "Enabled"; "failed" vs "Retrying" vocabulary | P1 | integrations truth | wt-admin | open |
| 10 | Shop record repeats facts three times; empty Last order card; Visits tab mini-table | P1 | 10-target page | wt-admin | open |
| 11 | Columns clip at 1440: visits, memos, shops, agents; indeterminate header checkbox | P1 | every list | wt-admin | open |
| 12 | Field Today: map markers look like toggles, label overlaps the GPS dot, "0 m away", toast position | P1 | 10-target page | wt-public | open |
| 13 | Landing hero: auto-rotate (≤300 ms, transform/opacity, pause on hover/focus, stop on interaction, no layout shift, reduced motion), ALL-CAPS eyebrow, seam, 390 crop, tab labels | P1 | first impression | wt-public | open |
| 14 | Active visit: primary action should be Create order; "verified" before check-in; gold as decoration; duplicate status | P1 | 10-target page | wt-public | open |
| 15 | Sale workspace: bag badges in order mode, CTA price vs breakdown, placeholders that read as data, gold selection wash | P1 | 10-target page | wt-public | open |
| 16 | Sample record: status chip looks like a button, overdue has no action, custody told 4×, photo hidden at 768/390 | P2 | 10-target page | wt-admin | open |
| 17 | Order record: total ×4, rate snapshot time, unlabeled cancel button, truncation | P2 | approvals | wt-admin | open |
| 18 | Visit record: wall of "No value" when planned; gold planned fence; duplicated highlights | P2 | records | wt-admin | open |
| 19 | Playwright crawler: reachable routes (≤2 per pattern) and up to 40 safe controls per page as manager, agent, visitor, new owner; no 4xx/5xx, no console errors | P2 | broken controls | lead | done 714b8b9, 5d9be16, bcb46b9 (0 failures); scope reworded after verifier |
| 20 | EXPLAIN Home, shops, orders, activity at 50 shops / 500 orders / 2k events; add missing indexes | P2 | scale | wt-conc | done 128f081 (no N+1; 2 indexes; EXPLAIN.md) |
| 21 | Login `→` arrows, ack page total under the sticky bar, developers example payloads, field profile/visits/catalog polish | P2 | polish | wt-public | open |
| 22 | Settings, ⌘K, Catalog, Integrations 390, forms (date input, raw credit limit) | P3 | polish | wt-admin | open |
| 23 | OWNER / MANAGER roles beyond ADMIN | P3 | larger teams | lead | open |
| 24 | Baseline gate red: webhook backoff tests on a non-UTC Postgres | P0 | money/integrations | lead | done 53ba4d3 |
| 25 | Email verification + shared rate-limit store before public signup (security M1/M2) | P1 | abuse | lead | open: needs an email provider and Redis/Postgres limiter; out of scope tonight |
| 26 | Raw SQL time comparisons zone-proof (`now() AT TIME ZONE 'UTC'`), migration review F4 | P2 | robustness | lead | done f33c573 (7a; IST run 63/64) |
| 27 | Deactivation audit per visit + assign ‖ deactivate race (invariant review item 10, verifier finding 4) | P1 | audit truth | lead | done (S6, S7) |
| 28 | `/admin/orders` returns up to 500 full orders (~900 KB): cursor pagination (contract change) | P2 | scale | lead | API done (R6, opt-in `limit`/`cursor`); the web list still reads the bare 500 — switching it is open |
