# Cluster: orders-pricing (tier T3)

## Owned paths
- `packages/shared/src/pricing.ts` (+ `pricing.test.ts`): `priceDesign`, `orderTotals`, `GST_BPS`, the half-up `div`
- `apps/api/src/core/rates.ts`: `RatesService.current`, `price()`, `valueOrZero`
- `apps/api/src/modules/orders.ts`: create (field), read
- `apps/api/src/modules/admin.ts`: `orders/:id/approve|reject`, `gold-rates` (GET/POST), designs (price display)
- catalog endpoints in `apps/api/src/modules/visits.ts` (`/visits/:id/catalog`, `/field/catalog`)
- `apps/web/src/components/field/sale/order-*`, admin orders and gold-rates pages, `components/jr/money.tsx`
- SQL: `GoldRate_append_only`, `OrderItem_append_only`, `Order_totals`, `OrderItem_values`, `GoldRate_positive`, `JewelryDesign_weights`, UNIQUE `Order(tenantId,clientOpId)` and `(tenantId,number)`

## Invariants
- INV-4 order lines freeze rate and components at write time; never recomputed (test 8)
- INV-5 order create is idempotent (test 3)
- INV-7 integer paise and mg; one pricing function shared by API (authoritative) and web (display)

## State machine
Order: SUBMITTED → APPROVED | REJECTED (one-shot; a second decision → `409 ORDER_ALREADY_DECIDED`, test 9). DRAFT exists in the enum but the API does not write it.
Batch approve (`POST /v1/admin/orders/approve`, 2026-10-21) is a loop over the same `decide()` — one transaction, audit row and `order.approved` per order, per-order `{id, ok, error?}`; it never batches several orders into one transaction, so one bad id cannot roll back the rest (test R4 in `records.test.ts`).

## Worked example (known answer, checked with `priceDesign` on 2026-10-21; not yet in `pricing.test.ts`, so add it with the next pricing change)
22K, net 31,800 mg, rate ₹10,540.00/g (1,054,000 paise), making PER_GRAM ₹650.00/g (65,000):
gold = div(31,800 × 1,054,000, 1000) = 33,517,200 · making = div(31,800 × 65,000, 1000) = 2,067,000 · unit = 35,584,200 · GST 3% = 1,067,526 · total = 36,651,726 paise (₹3,66,517.26).

## Consequential
Any change to the formula, rounding, GST base, rate selection (`effectiveFrom <= now()`), snapshot fields, approval rules, or the doc number format `ORD-YYYY-NNNNN`.

## Verification gate
`pnpm --filter @jewelroute/shared build && pnpm --filter @jewelroute/shared test` (known answers), `pnpm --filter @jewelroute/api test` (tests 3, 8, 9), `pnpm verify`.
