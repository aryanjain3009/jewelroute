# JewelRoute

> Taking this over? Start with **[HANDOVER.md](HANDOVER.md)** — run it locally in 5 minutes, demo script, docs map, deploy steps.

**Know where every salesman went, what he sold, and where every gram of jewellery is.**

JewelRoute is a multi-tenant field-sales operating system for jewellery manufacturers and wholesalers. Agents carry valuable sample pieces to retailers, take orders, and leave pieces on memo. JewelRoute proves each step and records it in a ledger.

| | What it does |
|---|---|
| **GPS-verified visits** | The server checks the geofence; check-in is impossible outside the shop's radius. Every visit needs a photo proof with a checksum and capture coordinates. EXIF is never trusted. |
| **Proof-of-custody memos** | The agent picks exact tagged pieces and sets a due date. Custody moves agent → shop in one transaction, and the retailer acknowledges by QR or 6-digit code on their own phone. |
| **Gold-rate catalogue + orders** | Prices are computed from today's 22K/18K/24K rate (gold value + making + stones + other + 3% GST). Every order freezes its rate and price snapshot. |
| **Command centre** | Orders today, visits, samples outside, memo value, overdue value and pending approvals, plus a live map, an activity feed, approvals and exceptions. |
| **Signed webhooks** | A transactional outbox feeds HMAC-SHA256-signed deliveries. Failed deliveries retry 7 times with backoff and then dead-letter. The page shows delivery logs, sends test events and lets you retry by hand. |

## Monorepo

```
apps/api        NestJS 11 + Prisma 6 (PostgreSQL) — REST under /v1, Swagger at /docs
apps/web        Next.js 15 (App Router) — landing, /login, /field/*, /admin/*, /ack/:token, /developers
packages/shared pricing, geofence, IST dates, formatting, event catalogue (used by both)
docs/           CONTRACT.md (API), DECISIONS.md (why), DESIGN.md (design system)
```

## Run locally

```bash
pnpm install
docker compose up -d db                       # or any Postgres 16
cp apps/api/.env.example apps/api/.env        # fill secrets (see file)
pnpm --filter @jewelroute/api db:migrate && pnpm --filter @jewelroute/api db:seed
pnpm --filter @jewelroute/api dev             # http://localhost:4000  (Swagger /docs)
# …or everything in one go: ./scripts/run-local.sh
pnpm --filter @jewelroute/web dev             # http://localhost:3000  (proxies /api → :4000)
```

Demo logins: field agent `rahul@aurum.test` / `Rahul@2026`, manager `admin@aurum.test` / `Aurum@2026`. The login page also has one-tap demo buttons.

Tests: `pnpm --filter @jewelroute/api test` covers concurrent check-in, idempotent orders, double memo of one piece, custody ledger, tenant isolation, webhook backoff and dead letter, and price snapshots. To run the 26-step end-to-end scenario against any deployment: `BASE_URL=https://… CRON_SECRET=… pnpm --filter @jewelroute/api e2e`.

## Deploy (Vercel)

There are two Vercel projects from this repo.

**`apps/api`** (framework "Other")
- `vercel.json` routes every path to the Nest function.
- The build runs `prisma migrate deploy` against `DATABASE_URL_DIRECT`.
- Env:
  - `DATABASE_URL` (pooled), `DATABASE_URL_DIRECT`
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
  - `APP_ENCRYPTION_KEY` (32-byte base64), `APP_SECRET`, `CRON_SECRET`
  - `APP_PUBLIC_URL` (web origin), `API_PUBLIC_URL`, `CORS_ORIGINS`
  - optional `BLOB_READ_WRITE_TOKEN`
  - optional `ENABLE_DEMO_RECEIVER` (`true`/`false`) for the built-in webhook receiver `/v1/dev/webhook-receiver/:token`. Unset means on in dev, and in production only for demo-mode tenants. `false` makes it always 404.
- Seed once: `curl -X POST $API/v1/internal/seed -H "x-cron-secret: $CRON_SECRET"`.

**`apps/web`** (Next.js)
- Env: `API_ORIGIN` = the API URL.
- `/api/*` is rewritten to the API, so the auth cookies stay first-party.

## Key decisions (full list in docs/DECISIONS.md)

- **No Redis/BullMQ yet.** Vercel functions can't host a long-lived worker. A Postgres outbox with `FOR UPDATE SKIP LOCKED` leasing gives at-least-once, concurrency-safe delivery at this scale. Delivery is triggered after each commit (`waitUntil`), when the dashboard is read, and by cron. `DispatchQueue` is the seam for swapping in BullMQ.
- **Database-enforced invariants:**
  - an agent has at most one open visit (partial unique index);
  - a piece is on at most one open memo (partial unique index);
  - the custodian column must match the custodian type (CHECK);
  - gold rates, the custody ledger and order lines are append-only (triggers).
- **Idempotency.** An `Idempotency-Key` row is written inside the business transaction, and `clientOpId` is unique on orders and memos. Retries replay the stored response and never create a duplicate.
- **Simulated arrival exists only in demo-mode tenants.** It is stored as `SIMULATED` and never shown as verified.
- **MapLibre + OpenFreeMap tiles.** The maps need no API key and use OSM data.
