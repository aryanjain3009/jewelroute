# Profile — durable facts (change only with evidence; record the change in learnings.md)

## Units (INV-7)
| Quantity | Storage | JSON field suffix | Notes |
|---|---|---|---|
| Money | `BIGINT` paise | `…Paise` (JSON number) | ₹1 = 100 paise. Rendered `₹1,48,500`; compact `₹48.5K` / `₹14.9L` / `₹1.2Cr` (`formatINRCompact`; never M/B) |
| Weight | `INTEGER` milligrams | `…Mg` | 1 g = 1,000 mg. Gross ≥ net > 0 (CHECK) |
| Gold rate | `BIGINT` paise per gram of that purity | `ratePaisePerGram` | |
| Making charge | `PER_GRAM`: paise per gram of net weight · `PERCENT`: basis points of gold value | `makingChargeValue` | 1200 = 12% |
| GST | basis points | `GST_BPS = 300` | 3% on the order subtotal, computed once |
| Distance | metres (float) | `…M` | geofence radius integer metres, default 100 |
| Business date | `DATE` at UTC midnight, meaning an IST day | `YYYY-MM-DD` | always Asia/Kolkata (`istDate`) |

Rounding: every division is half-up integer division (`div` in `packages/shared/src/pricing.ts`). Gold value = `div(netWeightMg × ratePaisePerGram, 1000)`.

## Purity table
| Enum | Karat | Fineness ‰ (hallmark) | Priced from |
|---|---|---|---|
| `K24` | 24K | 999 | its own `GoldRate` row |
| `K22` | 22K | 916 | its own `GoldRate` row |
| `K18` | 18K | 750 | its own `GoldRate` row |
| `K14` | 14K | 585 | its own `GoldRate` row (the seed sets none, so `Design.price` is `null`) |
Each purity has its own rate. Never derive one purity's rate from another (no `K24 × 0.916` in code). Fineness is display and hallmark data, not a pricing input.

## Gold-rate snapshot rule (INV-4)
- Rates are append-only. Current = latest `effectiveFrom <= now()` per purity (`RatesService.current`).
- An order freezes, per line, `goldRateId`, `ratePaisePerGram` and every component (`goldValuePaise`, `makingPaise`, `stonePaise`, `otherPaise`, `unitPricePaise`, `lineTotalPaise`), plus `Order.goldRateSnapshot[]` per purity. These are never recomputed (a trigger blocks `UPDATE`).
- `MemoItem.valuePaise` = valuation at handover (exposure). A memo-to-order conversion prices at **today's** rate, then freezes that.
- Catalog and bag values (`Piece.valuePaise`, `Design.price`) are live at today's rate and must be labelled as such. They are never stored as a price.

## Tenant model (INV-6)
- One Postgres database. Every row has `tenantId`. Isolation is enforced in the app (no RLS): `tenantId` comes only from the verified access JWT (`ctx.user.tid`) and every query filters by it.
- Another tenant's or another agent's ids → `404 NOT_FOUND` (no existence leak). Test 6.
- `Tenant.demoMode` allows clearly labelled `SIMULATED` check-ins. They are never shown as verified.
- Seed tenant: `aurum` (Aurum Jewels). Demo users are in `README.md`.

## Roles
| Role | Permissions (`ROLE_PERMISSIONS`, `apps/api/src/common/auth.ts`) | Surface |
|---|---|---|
| `FIELD_AGENT` | `field` | `/v1/field/*`, `/v1/visits/*` (own visits, bag, memos only); web `/field/*` |
| `ADMIN` | `admin`, `admin.read`, `field` | `/v1/admin/*` plus read on field resources; web `/admin/*` |
| retailer (no account) | public token | `/v1/public/memo-ack/:token`; web `/ack/[token]` |
A new role is one map entry plus tests.

## Stack pins (from package.json / lockfile, 2026-10-21)
Node 22 (`.nvmrc`) · pnpm 10.28.0 · TypeScript 5 · Postgres 16 (local/CI), Neon (hosted) · NestJS 11.1.6 on Express 5 · Prisma 6.19.3 (output `apps/api/generated/prisma`) · zod 4 (api) / zod 3 (web) · Next.js 15.5.28 · React 19.1.0 · Tailwind 4 · TanStack Query 5 · shadcn on radix-ui · MapLibre 5 + OpenFreeMap · Vercel (two projects: api, web).

## Harness rules
- At most 12 model-invoked skills. Every skill has "Use when…", Gotchas, Steps and "Done when", in 40–150 lines.
- Before adopting a third-party skill, hook, plugin or MCP server: read every file, pin the version, no `curl | sh`, no `@latest`.
- Reviewers never get Write/Edit. Agents never spawn agents.
- `pnpm verify` is the one gate. The Stop hook blocks "done" while affected checks fail.
