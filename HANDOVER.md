# JewelRoute — handover

**What it is.** JewelRoute is a multi-tenant field-sales system for jewellery manufacturers and wholesalers. It answers, with proof:
- where every salesman went;
- what he sold;
- where every sample piece is right now.

It has two apps. The **field app** is phone-first and used by agents in shops. The **manager app** is laptop-first and built in Attio's style. Both use one NestJS API on PostgreSQL.

**State at handover (21 Oct 2026).**
- Code: full git history included (see the bundle in the handover zip).
- Verification:
  - An independent verifier ran the full scenario and the failure cases and gave an **APPROVE** verdict (`docs/VERIFY-REPORT.md`).
  - The v3 credit, approval and activity work passed a high-risk review and re-review (`docs/brain/reviews/`).
  - A clicked UI walkthrough as Rahul, then Priya, with every number cross-checked against the API, found defects; all of them are fixed (`docs/VERIFY-P7.md`).
- Tests:
  - API integration tests: 77/77, against real Postgres (including 19 audit edge cases checked against DB rows);
  - shared pricing and credit tests: 14/14;
  - end-to-end business scenario: 31/31;
  - browser E2E (Playwright): 33/33. They cover sign-in and redirects, Rahul's full visit, the manager flows, webhook retries and the landing page. Run them with `cd apps/web && pnpm e2e` against a running stack.
  - harness hook tests: 102/102.
- Gates: the production web build passes, and so does `pnpm verify`.
- **Not deployed yet.** Deploying needs a GitHub repo; see §6.

---

## 1. Run it on a laptop (5 minutes)

Requirements:
- Node 22 or newer. Check with `node -v`, or install with `brew install node@22`.
- Postgres. The script handles it in this order:
  1. it uses Postgres if it's already running;
  2. otherwise it starts Docker if that's running;
  3. otherwise, on a Mac, it installs Postgres 16 with Homebrew.

```bash
cd jewelroute
./scripts/run-local.sh --prod     # production build, fast pages (recommended for demos)
# or
./scripts/run-local.sh            # dev mode with hot reload
```

The script does the rest, in order:
1. installs dependencies;
2. builds the app;
3. applies the migrations;
4. starts the API on **:4000** and the web app on **:3000**;
5. loads the demo company, **Aurum Jewels**.

| | |
|---|---|
| App | http://localhost:3000 (landing page) → **Sign in** |
| Field agent | `rahul@aurum.test` / `Rahul@2026`. There is also a one-tap button on the login page. Use phone width (DevTools device mode). |
| Manager | `admin@aurum.test` / `Aurum@2026`, or the one-tap button |
| API docs (Swagger) | http://localhost:4000/docs |
| Developer guide | http://localhost:3000/developers |
| Reset demo data | `curl -X POST localhost:4000/v1/internal/seed -H "x-cron-secret: $(grep ^CRON_SECRET= apps/api/.env \| cut -d= -f2-)"` |
| Prove the whole flow | `cd apps/api && BASE_URL=http://localhost:4000 CRON_SECRET=$(grep ^CRON_SECRET= .env \| cut -d= -f2-) pnpm e2e` → 31/31 |

Ports can be changed: `API_PORT=4100 WEB_PORT=3100 ./scripts/run-local.sh`. To use your own database: `DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/run-local.sh`.

## 2. Five-minute demo script

1. **Priya (manager), `/admin`.** The greeting and a strip of metrics: orders today, visits, samples outside, overdue memo value, pending approvals. Below them:
   - **Needs attention**, which lists only exceptions;
   - the live field map;
   - the activity timeline.
2. **Settings → Gold rate.** Set 22K, e.g. ₹10,612.50/g. Catalogue prices change immediately. Existing orders keep their frozen snapshot.
3. **Rahul (field, phone width), Today.** Sharma Jewellers at 10:30 is the highlighted next stop. Tap **Open visit**.
4. **Check in.** Away from Delhi, use **Simulate arrival (demo)**. It is labelled *simulated* everywhere, never as verified. Then take or upload the **arrival photo**, which is required before any sale.
5. **Browse catalog → book an order.** Each price is net grams × today's rate + making + stones + other + 3% GST.
   - The review screen shows the shop's credit position, as calculated by the server: outstanding, credit limit, available credit, this order and projected exposure.
   - A normal order is **Confirmed** at once.
   - An order goes to **Pending approval** only by rule: the projected exposure exceeds the shop's credit limit, or the order is above the approval threshold (₹10L by default, set in Settings → Approvals). The agent is shown the reason. For example, add the Rajwada Bridal Set to go over the limit.
6. **Leave on memo.** Pick **AJ-S-000123** and another piece from the bag, set the due date to 5 days and create the memo. Open the QR link in a new tab as the retailer and tap **Confirm receipt**. AJ-S-000123 now leaves Rahul's bag.
7. **Complete visit.** The next shop becomes the highlighted stop.
8. **Back to Priya:**
   - **Home** shows the new memo, the order and the samples at the shop.
   - **Shops → Sharma Jewellers** is a CRM record:
     - it shows the assigned agent, last and upcoming visit, outstanding, credit limit, available credit, samples at the shop and active memo value;
     - its tabs are Overview / Visits / Orders / Memos / Activity.
   - **Orders → the pending order** shows the credit check at booking and the reasons. Approve it, or reject it with a reason. Rahul's visit screen shows the decision and the reason within about 10 seconds. Rejecting an order created by selling memo pieces puts those pieces back on the memo, with the ledger reason "Sale rejected".
   - **Visits → the visit** shows the map, the GPS distance and the photo with its checksum.
   - **Samples → AJ-S-000123** opens with **Where it is now**: which shop, since when, on which memo, due when, and who acknowledged it and how. Below that is the immutable custody ledger: Vault → Rahul → Sharma, each step with time, actor, location, visit, proof and event id.
   - **The same event shows everywhere it applies.** One activity model (outbox events with record references) feeds Home, Shop, Agent, Visit, Order, Memo and Sample, so no screen keeps a feed of its own.
   - **Memos → the memo** shows the custody timeline.
   - **Integrations** shows signed webhook deliveries with status and latency, a retry button and the payload inspector.

## 3. What's inside

```
apps/api         NestJS 11 + Prisma 6 (PostgreSQL) — REST /v1, Swagger /docs, webhooks, seed
apps/web         Next.js 15 — landing, /login, /field/* (phone), /admin/* (Attio-style), /ack/:token, /developers
packages/shared  pricing, geofence, IST dates, INR formatting, event catalogue (used by both apps)
docs/            contract, design system, decisions, audit, verification, UI guide, report source
.claude/ + AGENTS.md + CLAUDE.md   Claude Code harness: rules, 13 skills, 6 subagents, 5 hooks, project memory (docs/brain)
scripts/         run-local.sh, harness tests, MCP wrappers
```

| Read this | For |
|---|---|
| `JewelRoute-FE-BE-Integration-Report.pdf` (in the handover zip, and in `docs/report/out/`) | 58 pages: architecture, all 89 endpoints, API design, data model, click-by-click data flow, 15 flowcharts |
| `docs/CONTRACT.md` | The API contract both apps build against, with a changelog at the top |
| `docs/DECISIONS.md` | Why things are built the way they are |
| `docs/DESIGN.md` | Design system. The **v2 (Attio)** section is the current one. |
| `docs/UI.md` | Every page and what it shows, plus libraries used |
| `docs/AUDIT.md` | 19 correctness issues found and fixed, each with a test |
| `docs/VERIFY-REPORT.md` | Independent verification: 28 steps, failure cases, findings → fixes → re-verification |
| `docs/VERIFY-P7.md` | Independent UI walkthrough as Rahul, then Priya. Every screen number cross-checked against the API, with defects → fixes → round 2. |
| `docs/AUDIT-SYNC.md` | Final audit: all 90 endpoints mapped as UI action → API → DB → event → screens that refresh, with bugs found and fixed |
| `docs/brain/reviews/` | High-risk (T3) reviews of the v3 credit, approval and activity work, plus re-review |
| `AGENTS.md` | Map for engineers and AI agents: commands, invariants, risk tiers |

## 4. Guarantees, and where they are enforced

| Guarantee | Enforced by |
|---|---|
| A visit only counts from inside the shop | Distance recomputed on the server from the shop's coordinates; check-in refused outside the fence |
| An agent has one open visit at a time; no duplicate check-ins | Partial unique index plus row lock |
| No sale without an arrival photo | `409 PROOF_REQUIRED_BEFORE_SALE` on order, memo, return and convert |
| Every piece has exactly one custodian | CHECK constraint, a single custody function with row locks, and an append-only `CustodyEvent` ledger |
| A piece can be on only one open memo, and only its holder can leave it | Partial unique index, plus a custodian check inside the transaction |
| Retries never duplicate orders or memos | Required `Idempotency-Key`, stored inside the same transaction, plus unique `clientOpId` |
| Historical prices never change | Order lines freeze the rate and price; gold rates and order lines are append-only (database triggers) |
| Tenants never see each other's data | Tenant taken only from the signed token; every query is filtered by it; tested with two tenants |
| Integrations can't silently diverge | Transactional outbox; signed webhooks (HMAC-SHA256); retries 30 s / 2 m / 10 m / 30 m / 2 h / 6 h; dead letter; manual retry |
| Every sensitive change is audited | Audit log with actor, before and after values, and request id |
| Approval happens only by rule, and the server decides | Credit position and reasons are computed on the server with one shared function (`packages/shared/src/credit.ts`) when the order is written. The screens only display it. The memo-sale preview uses the same function. |
| A rejected sale never strands a piece | Reject reverses a memo sale through the custody service (`SALE_REJECTED`). SQL guards stop a SOLD piece from existing without a live order. `pnpm --filter @jewelroute/api db:check-orphans` reports any. |
| No deadlocks between order and memo writes | One lock order everywhere: Memo → Visit → Pieces → Shop → Order (DECISIONS) |

## 5. Key decisions

- **No Redis/BullMQ yet.** Vercel functions can't host a long-running worker. A Postgres outbox with `FOR UPDATE SKIP LOCKED` is just as safe at this scale. Webhooks are dispatched after each commit, when the dashboard or delivery list is read, and by cron. `DispatchQueue` is the place to plug in BullMQ later.
- **MapLibre + OpenFreeMap tiles.** No map API key and no usage bill.
- **Simulated GPS** exists only for demo tenants and is always shown as *simulated*.
- **Money and weight:** money is stored as integer paise and weight as integer milligrams. Dates are business dates in IST.

## 6. Deploy (Vercel + Neon/any Postgres)

The repo is ready for two Vercel projects from the same Git repo:
1. **API project.** Root directory `apps/api`, framework "Other".
   - `vercel.json` routes every path to the Nest function.
   - The build runs `prisma migrate deploy`, then the batched, idempotent activity back-fill.
   - Environment variables:
     - `DATABASE_URL` (pooled) and `DATABASE_URL_DIRECT`;
     - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `APP_SECRET`, `CRON_SECRET`;
     - `APP_ENCRYPTION_KEY` (32-byte base64);
     - `APP_PUBLIC_URL` (the web URL), `API_PUBLIC_URL`, `CORS_ORIGINS`;
     - optional: `BLOB_READ_WRITE_TOKEN` (Vercel Blob for photos) and `ENABLE_DEMO_RECEIVER=true` (built-in webhook test receiver).
     - optional: `TRUST_PROXY` (proxy hops for the client IP; unset = 1 on Vercel, 0 elsewhere — set 1 behind one nginx/ingress when self-hosting).
     - **never** `WEBHOOK_ALLOW_PRIVATE=true` in production: it switches off the webhook SSRF guard (local development / tests only — production always ignores it; a local webhook receiver on 127.0.0.1 needs it, the built-in demo receiver does not).
2. **Web project.** Root directory `apps/web`, framework Next.js. Environment variable: `API_ORIGIN` = the API URL.
3. After the first deploy, seed once:

   ```bash
   curl -X POST $API/v1/internal/seed -H "x-cron-secret: $CRON_SECRET"
   ```

   Then run the 28-step check against the live API:

   ```bash
   BASE_URL=$API CRON_SECRET=… pnpm --filter @jewelroute/api e2e
   ```

Also included:
- **Docker:** `docker-compose.yml` (Postgres + API + web) and `apps/api/Dockerfile`, for hosting outside Vercel.
- **CI:** `.github/workflows/ci.yml`.

## 7. Known limitations and next steps

- **Webhook retries on the Vercel Hobby plan:** cron runs daily, so retry delays are minimums. Delivery also happens on the next app traffic. Use Pro cron or BullMQ for exact timing.
- **Rate limits** are in memory per instance. Move them to Redis when scaling out.
- **Retailer acknowledgement** is QR or a 6-digit code read aloud. There is no SMS provider; adding one is a drop-in on the same code.
- **Photos without Blob** are stored in Postgres (fine for a demo). Configure Vercel Blob or S3 for production.
- **Admin screens are designed for laptop or tablet.** At 390 px they work but are cramped; the field app is the phone app.
- **Next steps:** mobile offline queue, SMS/WhatsApp acknowledgement, Tally/ERP connector on the webhooks, more roles (the RBAC map is ready), PostGIS if geo queries grow.

## 8. Security notes for whoever takes this over

- No secrets are in this repo. `.env` files are generated locally by `run-local.sh` and are gitignored.
- The demo accounts and passwords above are seed data for the demo tenant only.
- The Neon database provisioned during the build (if you use it) must be claimed by its owner. Rotate its password after claiming, because the connection string appeared in a build log.
