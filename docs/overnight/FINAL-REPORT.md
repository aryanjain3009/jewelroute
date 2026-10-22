# JewelRoute: overnight final report (22 Oct 2026, 02:56–09:40 IST)

**What this is:** one night of autonomous work on JewelRoute, on branch `overnight` (from `main` dde3f88). Nothing was pushed. Aryan's repository was not fetched or touched, on the user's instruction, so there is no `super-final` branch, no `apply-to-aryan.sh`, and no merge decisions about Aryan's work. The deliverable is `JewelRoute-OUR-FINAL.zip`.

**How the night was organised:**
- A lead worked in the main tree.
- Three agents each worked in their own git worktree, with their own database and ports:
  - `wt-conc`: concurrency tests and EXPLAIN;
  - `wt-admin`: the admin UI;
  - `wt-public`: the landing page, the field app and the public pages.
- The lead merged their branches into `overnight` after the gates passed.
- Independent reviewers checked the lead's high-risk changes: security, migration, invariant and verifier.

**Not reviewed by a person yet.** Before any of this goes into a merge request, the owner must walk through the diff line by line.

## 1. What was built and fixed

### Product and API (lead)
| Item | Commit | Proof |
|---|---|---|
| **Baseline gate was red on this Mac.** Postgres ran in Asia/Kolkata. Raw SQL compared UTC `TIMESTAMP(3)` columns with `now()` and `timestamptz` params, so webhook retries fired at once, 30 s leases lasted 5.5 h, and a gold rate scheduled for later would apply early. Fixed in two steps: (1) a migration pins the database default to UTC, with a down script and a boot-time error log; (2) every raw `now()` became `(now() AT TIME ZONE 'UTC')`. | 53ba4d3, f33c573 | Tests 7, A11, F12 green again. Test 7a fails on any bare `now()` in `src`. With the DB forced back to IST, the api/audit/failures/v3 suites pass 63/64; the only failure is 7a's deliberate UTC assertion. |
| `verify.mjs` also counts Node 24 test output. The repo pins Node 22, and every gate tonight ran on 22.23.3. | 53ba4d3 | verify receipts |
| **Self-serve signup.** `POST /v1/auth/signup` plus `/signup` creates a real (non-demo) workspace and its owner, and signs them in. An email signs in to one workspace (advisory lock on the email; agent create follows the same rule). | 4822e02, 2f81e73, d5bdd7c | `tenancy.test.ts` S1–S3 (S3: 10 parallel signups → 1 workspace); e2e `admin-signup.spec.ts` |
| **Onboarding checklist** on Home: gold rate → design and pieces → shop → agent → issue → plan a visit. Each tick comes from `GET /v1/admin/onboarding`, which counts real rows. Catalog and Agents open their create sheets from `?new=1`. | 4822e02, 2f81e73 | S4; e2e ticks 0 → 3 → 5 → 6 of 6 from real data; `shots/lead/onboarding-empty-1440.png` |
| **A new agent at a new shop works end to end:** route → GPS check-in (VERIFIED) → photo → order → memo → complete. | 4822e02 | S5 `buildWorkspace`; e2e at 390 (`shots/lead/new-agent-checked-in-390.png`) |
| **Tenant isolation proven across 3 signed-up workspaces.** Covered: 13 lists, ⌘K search, 12 record and file reads, 9 foreign writes, the ack page, webhook deliveries, and file URLs (each checked to return 200 for its own workspace and 404 for another). | 4822e02, d516bf6 | S5 |
| **Agent deactivation:** cancels PLANNED visits from today, with one audit row per visit. Open visits, the bag and memos stay with the physical pieces. A new attention item, `AGENT_INACTIVE_CUSTODY`, shows until the pieces are back in the vault. Assignment and (de)activation lock the agent row. | eb56953, d5bdd7c, e2e2877 | S6; S7 had 7 stray planned visits without the lock and 0 with it |
| **Opt-in keyset paging** on `GET /v1/admin/orders` (`limit`/`cursor` → `{ items, nextCursor }`). The bare 500-row list is unchanged. | f2b344f | R6 |
| **Clipboard failures** threw unhandled errors and claimed "Copied" anyway. Found by the crawler; fixed with `copyText()`. | 714b8b9 | crawler receipts |
| `records.test` X1 plan check made independent of table statistics after the merge. | 9eaf75e | verify |

### Concurrency and scale (`wt-conc`)
| Item | Commit | Proof |
|---|---|---|
| `concurrency.test.ts`: 9 races ×20 over real HTTP, with whole-workspace DB invariants after each (see §3). | 06bb728 | C1–C9 |
| Fixed: `settle` and shop `PATCH` read their before-images under the shop lock. A webhook used to say PENDING_APPROVAL for an order settled as APPROVED, and concurrent limit changes wrote stale audit rows. | 06bb728 | C3, C6 red → green |
| EXPLAIN at three volumes. No N+1: statements per request stay flat (home 55, shops 13, orders 7, activity 9). Indexes added: `Order(tenantId, createdAt)` (12 ms → 0.6 ms at 5k orders) and `MemoExtension(memoId)`. The shop list's last-order query became `LATERAL`. | 128f081 | X1, X2; `EXPLAIN.md`; migration-reviewer APPROVE |

### Admin UI (`wt-admin`; full list in `log-wt-admin.md`)
- **Seed:** today's rate now exists before the morning's orders (076fd1c, R0).
- **Integrations:** endpoint health reads "Enabled · failing: 2 retrying in 24 h" (87adc39, R0c).
- **404:** every record page answers a 404 with a not-found state (ff737fc).
- **Lists:** column widths at 1440; secondary columns dropped on phones; "Sorted by" menu with direction (98f8583, 4b34ce1, 5ea453c, d92c939).
- **Fewer repeated facts** on Home, shop, order, visit, memo, sample and agent pages (7367eff, 8e38750, 2efe124, 29c3d4d, e7a1b13, 122f44c).
- **Shop record:** shows "In visit now" during a live visit.
- **Proof photos:** fall back to a camera icon if the photo fails to load.
- **Sample record:** chip beside the tag, Extend due date on an overdue piece, photo in the header on tablets and phones (fd138c0, 24d04cb, c726567).
- **Orders list:** a Review button on pending orders opens the side sheet with the credit check in view (2193fa9, 5ab2a13, 266a2fa).

### Landing, field and public (`wt-public`; full list in `log-wt-public.md`)
- **Hero switch** (32578ca, d30a182):
  - auto-rotates using transform and opacity at 240 ms;
  - pauses on hover and focus, and stops for good on the first click or tap;
  - no layout shift (CLS < 0.01, identical frame box after a full cycle, checked in e2e);
  - no motion with reduced motion;
  - sentence-case pill, "Create your workspace" entry points;
  - the mocks follow the app's own rules.
- **Field Today** (8c3d9fc):
  - the map fits every stop (a style-load camera reset had hidden 3 of 4);
  - numbered markers in ink, green or grey, and the label never sits under the GPS dot;
  - "You're here" instead of "0 m";
  - toasts sit above the bar.
- **JrMap fix** (6329146): the fence painted a stale verdict after the server said "inside".
- **Active visit and sale** (b078215, c132d7d):
  - neutral pre-check-in notice;
  - Create order is the primary action until something is recorded;
  - a photo that fails to load shows a camera tile;
  - the total is pinned "incl. GST";
  - every step scrolls to the top;
  - 3 columns at ≥ 600 px.
- **Copy:** "jewellery" spelling (115ce15).
- **Proof:** prod landing e2e 12/12 and field 23/23 on their branch.

## 2. System design
See `docs/overnight/SYSTEM-DESIGN.md`. In short:
- **Tenants:** the tenant comes only from the JWT.
- **Roles:** RBAC is a permission map. Roles today are ADMIN (owner and manager) and FIELD_AGENT; a separate MANAGER role is one enum value plus one map row, and was not built (see §7).
- **Lifecycles** of visits, orders, memos, piece custody and webhook delivery.
- **Lock order:** Memo → Visit → SamplePiece → Shop → Order. New tonight: the agent row lock for assign and deactivate.
- **Idempotency:** the key row lives inside the business transaction.
- **Outbox:** written in the same transaction; the activity feed is a projection of it.
- **Cache invalidation:** the web app's `AFFECTS` map (the new `onboarding` key is wired into it).

## 3. Concurrency results (×20 each; detail in `CONCURRENCY.md`)
| # | Scenario | Result |
|---|---|---|
| C1 | Two tabs plus a second agent memo the same piece | 1×201, 19×409 · PASS |
| C2a | Check-in on two visits of one agent at once | exactly 1 open visit, 1 event · PASS |
| C2b | Complete-visit racing 9 orders and 10 memos | the completion summary counts every sale · PASS |
| C3 | Approve / reject / cancel / settle on one pending order (plain and memo-converted) | **FAIL → fixed 06bb728** (settle event status) |
| C4 | Reject of a converted order racing converts on the same memo | un-sold once, re-sold at most once · PASS |
| C5 | Gold-rate inserts during booking | one frozen rate per purity; lines reprice exactly · PASS |
| C6 | Credit-limit PATCH during booking | **FAIL → fixed 06bb728** (stale audit before-image); decisions were already right |
| C7 | QR confirm ×10 racing OTP ×10 | one `memo.acknowledged`, one audit row · PASS |
| C8 | One refresh token ×20 | one successor, grace used once, then the family revoked · PASS |
| C9 | Dispatch ×20 across two API processes | each due delivery attempted once · PASS |
| S3 | 10 signups with one email | 1 workspace · PASS |
| S7 | Deactivation racing 10 assignments | **FAIL → fixed e2e2877** (0 planned visits left for an inactive agent) |

## 4. Endpoints, routes and the crawler
- **New or changed API:**
  - `POST /v1/auth/signup`
  - `GET /v1/admin/onboarding`
  - `PATCH /v1/admin/agents/:id` (`cancelledVisits`)
  - `AttentionItem` kind `AGENT_INACTIVE_CUSTODY`
  - `GET /v1/admin/orders` paging
  - webhook endpoint stats `retrying24h`/`dead24h`
  - All are in the `docs/CONTRACT.md` changelog dated 2026-10-22.
- **New web route:** `/signup`.
- **Crawler** (`apps/web/e2e/admin-crawl.spec.ts`): follows same-origin links (at most 2 pages per route pattern; `?tab=` pages count separately) and presses up to 40 non-destructive controls per page. It fails on any 4xx/5xx, console error or page error. The retailer `/ack/[token]` pages are covered by `public.spec.ts`. Receipts are in `docs/overnight/crawl-*.json`.

Final crawl on the frozen build (09:08 IST), 4/4 tests passed:

| Who | Pages | Controls pressed | Failures |
|---|---|---|---|
| Manager (Priya, 1440) | 32 | 377 | 0 |
| New owner, empty workspace from signup (1440) | 19 | 161 | 0 |
| Their first agent, empty (390) | 5 | 5 | 0 |
| Field agent (Rahul, 390, incl. the sale workspace) | 7 | 67 | 0 |
| Visitor (/, /login, /signup, /developers) | 4 | 17 | 0 |
| **Total** | **67** | **627** | **0** |

## 5. Test counts (final tree)
All run on the frozen tree (merge 3835632 plus docs), on Node 22.23.3:

| Gate | Result |
|---|---|
| `pnpm verify` | VERIFY PASSED |
| API integration tests (real Postgres) | **100/100** (77 at handover) |
| Shared pricing/credit tests | 14/14 |
| Harness hook tests | 102/102 |
| Web typecheck and lint | clean |
| API end-to-end business scenario (`pnpm e2e`) | **31/31** |
| Browser E2E (Playwright: field, admin, landing) | **44/44** (33 at handover) |
| Crawler | 4/4 tests, 0 failures (§4) |
| Screenshot sweep | 27 pages × 390/768/1440 = 81 shots (`screenshots/` in the zip) |

## 6. UI scores (1–10 against Attio and Stripe; 9 = a strong startup would ship it, 10 = Attio level)
The scores come from the builders, informed by independent fresh-context `ui-critic` passes plus the lead's own sweep. Details and screenshot paths are in `ui-scores-admin.md` and `ui-scores-public.md`.

| Page | Score | | Page | Score |
|---|---|---|---|---|
| Landing hero (target 10) | 9 | | Admin Home (target 10) | 8.5 |
| Landing, whole page | 8.5 | | Shop record (target 10) | 9 |
| /developers | 9 | | Sample record (target 10) | 9 |
| /login | 8.5 | | Visits list / record | 8.5 / 8.5 |
| /signup (lead) | 8.5 | | Agents list / record | 8.5 / 8.5 |
| /ack pending | 9 | | Shops list | 8.5 |
| Field Today (target 10) | 9 | | Orders list / record | 9 / 8.5 |
| Active visit (target 10) | 9 | | Memos list / record | 8.5 / 8.5 |
| Sale workspace, order (target 10) | 9 | | Samples list | 8.5 |
| Sale workspace, memo | 8.5 | | Catalog | 9 |
| /field/visits, catalog, profile | 9 | | Integrations / Settings | 8.5 / 8.5 |
| | | | Not found | 9 |

None of the seven 10-targets reached 10. Every page is at 8.5 or above. The reasons for each score below 9 are in the score files: record-page panel repeats across tabs, truncation in 9–10-column lists, and the landing page's length at 390.

## 7. Still open, and why
- **Before signup is public:**
  - email verification and a shared rate-limit store (security review M1, M2);
  - today's gaps: email squatting, and an `EMAIL_TAKEN` existence oracle on signup and agent create.
- **The one-email-one-workspace rule lives in code** (advisory lock + check), not in SQL. DDIA's fix for check-then-insert is a unique constraint, which would be better, but it would lock in a rule the security review flagged. Human decision.
- **Signup takes no Idempotency-Key.** A retry after a lost 201 gets 409 "sign in instead": one effect, but not the original answer.
- **No separate OWNER/MANAGER roles.** Building them needs an enum migration plus permission gating on every admin screen while those screens were being edited. Documented in SYSTEM-DESIGN.
- **The web Orders list still reads the bare 500-row list.** The API's new paging is unused.
- **Admin:**
  - record-page left panels repeat status, due and ack across tabs (needs a per-tab panel);
  - wide lists truncate long names (needs resizable or hidden columns);
  - Home activity overlaps with Needs attention (a product call);
  - activity de-duplication stays in the web feed because tests V6/V7 require the API to return every event;
  - "couldn't resolve that host" was not shipped, because the SSRF review forbids a DNS oracle.
- **Public and field:**
  - the landing page is long at 390;
  - `/login` thumbnails are hard to read at 1440;
  - the memo picker is price-heavy. Its "Tick each piece" bottom hint and a login crop exist uncommitted in the `wt-public` worktree; they were never gated, so they were not merged.
- **Machine incidents tonight:**
  - The disk filled at about 05:50 and blocked all work until about 08:50. The agents stopped early (about 06:00 instead of 07:20), and the final round of this report ran under time pressure.
  - Postgres's 100-connection cap was shared by three stacks and parallel test runs, causing two transient "too many clients" failures that passed on rerun.
  - One agent stopped another agent's API by reading a pid file from the shared scratchpad. No data was lost.
- **Unexplained flake:** one verifier run of the API suite failed P4 (Home not 2xx). It did not reproduce in two reruns or alone. Likely connection exhaustion, but not proven.

## 8. Reviews
- **Security** (signup, tenancy, deactivation): APPROVE. M3, L1 and L3 fixed; M1 and M2 open (§7).
- **Migration** (UTC pin): APPROVE. F4 done (f33c573).
- **Invariant review:** REJECT on audit item 10 → fixed in e2e2877.
- **Verifier:** REJECT on the crawler's scope claim and the assign race → fixed in e2e2877; the scope is now stated as in §4.
- **wt-conc's index migrations:** migration-reviewer APPROVE.
