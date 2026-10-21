---
paths:
  - "apps/api/src/**/{custody,memos,orders,catalog,gold-rates,rates,idempotency}*"
  - "apps/api/src/modules/admin.ts"
  - "packages/shared/src/pricing*"
---
# Custody, memos, orders, pricing — prohibitions (T3)

Owners: `docs/brain/clusters/custody-memo.md`, `docs/brain/clusters/orders-pricing.md`. Use the `money-math` skill for any arithmetic and `tdd` for any behaviour change. A failing test comes first.

**Units**
- Money is integer **paise**, weight is integer **milligrams**, making-charge percent and GST are **basis points** (`GST_BPS = 300`). Never floats, never rupees or grams in variables, never `toFixed`, `parseFloat` or `Math.round` on money.
- Every division goes through the shared half-up `div` in `packages/shared/src/pricing.ts`. Never add a second rounding helper.
- Price a design only with `priceDesign`, and order totals only with `orderTotals` (GST once on the subtotal, not per line), both via `price()` in `core/rates.ts`. Never re-implement the formula in a module or in the web app.
- `Number(bigint)` only at the response edge. Never compare paise as strings.

**Custody (INV-1, INV-2)**
- Move a piece only through `CustodyService.move(tx, ctx, { from, to, reason, … })`, inside the caller's transaction. Never `samplePiece.update` or `updateMany` with `custodian*` fields anywhere else. The only exceptions are intake (`seq 1`, `INTAKE`) and the demo seed.
- Always pass the **expected** `from` custodian. Never read the custodian and then write without the `FOR UPDATE` lock that `move` takes.
- Never write a `CustodyEvent` by hand outside `move`. Never update or delete one (a trigger blocks it).
- Memo rules: due date from today to today + 90 days (IST). Return or convert only pieces whose `MemoItem` is `OUT`. `MemoItem.valuePaise` is exposure at handover. It is not a price, and the memo-to-order conversion prices at today's rate.

**Snapshots (INV-4)**
- `OrderItem` rate, components and totals, and `Order.goldRateSnapshot`, are written once and never recomputed or updated. A rate change never touches an existing order, memo or delivery payload. Never "refresh" a historical price.
- The current rate is the latest `GoldRate` with `effectiveFrom <= now()` (`RatesService.current`). New rates are inserts. Never update a `GoldRate` row.
- Read rates inside the same `tx` that writes the order (`this.rates.current(tid, tx)`).

**Idempotency (INV-5)**
- Every create that takes `Idempotency-Key` (check-in, proofs, orders, memos, memo return/convert) runs inside `this.idem.run(ctx, (tx, clientOpId) => …)` and stores `clientOpId` where the table has it. Never do side effects before or outside that transaction. The post-commit dispatch is the only exception.
- Never catch-and-swallow inside `idem.run`. An error must roll back the key row so that a retry re-executes.

**Tenancy (INV-6)**: every query has `tenantId: ctx.user.tid`. An agent touches only their own visits, memos and bag. Foreign ids → `notFound()`.
