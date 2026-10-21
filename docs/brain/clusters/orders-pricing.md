# Cluster: orders-pricing (tier T3)

## Owned paths
- `packages/shared/src/pricing.ts` (+ `pricing.test.ts`): `priceDesign`, `orderTotals`, `GST_BPS`, the half-up `div`
- `apps/api/src/core/rates.ts`: `RatesService.current`, `price()`, `valueOrZero`
- `apps/api/src/modules/orders.ts`: create (field, credit rule), read, decide, settle, cancel, `/visits/:id/credit`, `/admin/shops/:id/credit`
- `apps/api/src/core/credit.ts` (`CreditService`: DB sums + shop lock) and `packages/shared/src/credit.ts` (`creditPosition`, pure; known answers in `credit.test.ts`)
- `apps/api/src/modules/admin.ts`: `orders/:id/approve|reject`, `gold-rates` (GET/POST), designs (price display)
- catalog endpoints in `apps/api/src/modules/visits.ts` (`/visits/:id/catalog`, `/field/catalog`)
- `apps/web/src/components/field/sale/order-*`, admin orders and gold-rates pages, `components/jr/money.tsx`
- SQL: v3 `Order_pending_has_reason`, `Order_approval_reasons_known`, `Order_settled_only_when_owed`, `Order_cancelled_at`, `Shop_credit_nonneg`, `Tenant_approval_threshold_positive` (`20261021000300_v3_credit_activity`); `GoldRate_append_only`, `OrderItem_append_only`, `Order_totals`, `OrderItem_values`, `GoldRate_positive`, `JewelryDesign_weights`, UNIQUE `Order(tenantId,clientOpId)` and `(tenantId,number)`

## Invariants
- INV-4 order lines freeze rate and components at write time; never recomputed (test 8)
- INV-5 order create is idempotent (test 3)
- INV-7 integer paise and mg; one pricing function shared by API (authoritative) and web (display)

## State machine (v3)
Create → `CONFIRMED` (no rule) | `PENDING_APPROVAL` (`CREDIT_LIMIT`: projected > limit, limit 0 = none; `ORDER_THRESHOLD`: total ≥ tenant threshold). Rule runs in the create tx after `SELECT … "Shop" … FOR UPDATE` (L0016, test V2); position frozen in `creditSnapshot`.
`PENDING_APPROVAL` → `APPROVED` | `REJECTED` | `CANCELLED`. `CONFIRMED` → `CANCELLED`. `CONFIRMED`/`APPROVED` → settled (`settledAt`, status unchanged). Cancel refuses settled and memo-converted orders; reject of a memo-converted order un-sells its pieces (L0019, V10). Decided → `409 ORDER_ALREADY_DECIDED`, other non-pending → `409 ORDER_NOT_PENDING` (tests 9, V4).
Exposure = opening + Σ unsettled CONFIRMED/APPROVED + Σ OUT memo items; pending orders do not count. Memo convert flips items to CONVERTED before the rule (no double count, V3). `SUBMITTED` exists in the enum for rollback only — CHECK `Order_no_submitted` (legacy mapping V9, rollback round trip V11, `prisma/rollback/20261021000300_v3_down.sql`).
**Lock order (global, every write path):** Memo → Visit → SamplePiece (id order) → Shop → Order. Convert: Memo → Visit → Pieces → Shop; order create: Visit → Shop; approve/reject/settle/cancel: Shop → Order, and for a memo conversion `decide()` first takes Memo → its Pieces (`lockConversion`); memo return/create: Memo/Visit → Pieces. Taking Shop before Memo deadlocked reject ‖ convert (re-review N1; V13 red → green).
**Convert preview** (`GET /memos/:id/convert-preview`, P7): same `price()` + `orderTotals` as the convert, and `CreditService.position(…, { excludeMemoPieceIds })` — the only way to take the chosen pieces out of memo exposure without writing, so preview and convert run the identical rule (P2 asserts the frozen position equals the preview). Never compute the rule in the browser.
Batch approve is a loop over `decide()` — one transaction, audit row and `order.approved` per order (R4).

## Worked example (known answer, checked with `priceDesign` on 2026-10-21; not yet in `pricing.test.ts`, so add it with the next pricing change)
22K, net 31,800 mg, rate ₹10,540.00/g (1,054,000 paise), making PER_GRAM ₹650.00/g (65,000):
gold = div(31,800 × 1,054,000, 1000) = 33,517,200 · making = div(31,800 × 65,000, 1000) = 2,067,000 · unit = 35,584,200 · GST 3% = 1,067,526 · total = 36,651,726 paise (₹3,66,517.26).

## Consequential
Any change to the formula, rounding, GST base, rate selection (`effectiveFrom <= now()`), snapshot fields, approval rules, or the doc number format `ORD-YYYY-NNNNN`.

## Verification gate
`pnpm --filter @jewelroute/shared build && pnpm --filter @jewelroute/shared test` (known answers), `pnpm --filter @jewelroute/api test` (tests 3, 8, 9), `pnpm verify`.
