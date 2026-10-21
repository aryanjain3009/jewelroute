---
name: money-math
description: Use when code computes, converts, rounds, sums or displays money, weight, gold rates, making charges, GST, memo exposure or order totals in JewelRoute (packages/shared/src/pricing.ts, core/rates.ts, orders, memos, dashboards, web Money components). Enforces integer paise/mg, half-up rounding in one place and known-answer tests written before the formula. Not for date/IST logic or geofence distance.
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# money-math — integers, one rounding rule, known answers first

## Done when
- Every amount is an integer of **paise**, every weight an integer of **mg**, every percentage **basis points**, end to end (DB `BIGINT`/`INTEGER`, TS `number` integers or `bigint`, JSON `…Paise`/`…Mg`).
- A known-answer test with hand-computed numbers exists **before** the code change, and passes after it: `pnpm --filter @jewelroute/shared build && pnpm --filter @jewelroute/shared test` (+ the api test if the server path changed).
- Every division in the change goes through the shared half-up `div` (`packages/shared/src/pricing.ts`) and its rounding direction is stated in a comment.
- No historical value (order line, memo item value, delivery payload) is recomputed from today's rate.

## Gotchas
- **Formula** (the only one): gold = `div(netWeightMg × ratePaisePerGram, 1000)`. Making = PER_GRAM `div(netWeightMg × paisePerGram, 1000)` or PERCENT `div(gold × bps, 10000)`. Unit = gold + making + stone + other. GST = `div(subtotal × 300, 10000)` **once on the order subtotal** (`orderTotals`), not per line. A line total = unit × quantity.
- **Overflow:** `netWeightMg × ratePaisePerGram` stays below 2^53 for realistic pieces (1 kg × ₹20,000/g = 2×10^12). Products of two money values or bulk sums over thousands of lines are not safe: use `bigint` there and convert with `Number()` only at the edge. Check with `Number.isSafeInteger` in tests for the worst case.
- **Floats leak in through:** `parseFloat`, `/ 100` for display, `toFixed`, `Math.round(x * 1.03)`, percentages as `0.03`, JSON from forms (`"1054.00"`). Convert user rupee input once at the boundary: `Math.round(Number(rupees) * 100)` is wrong for `"0.29"`. Parse the string: split on `.` and pad to 2 digits.
- Each purity has its own rate row. Never compute 22K from 24K × 916/999.
- **Display** only through `formatINR` / `formatINRCompact` / `formatGrams` / `formatRate` (`@jewelroute/shared`) or `Money`/`Grams` components: Indian grouping `₹1,48,500`, compact `₹48.5K` / `₹14.9L` / `₹1.2Cr` (what `formatINRCompact` emits; never M/B, never Western `₹1.49M`), never `Rs.`. Never write a new formatter.
- Sums in dashboards: sum integers in SQL (`SUM("totalPaise")` → bigint), not floats in JS.
- Memo exposure (`MemoItem.valuePaise`) is the valuation at handover. A memo-to-order conversion re-prices at **today's** rate and freezes that.
- The DB re-checks totals: `Order_totals` (total = subtotal + gst) and `OrderItem_values` (lineTotal = unit × quantity). A mismatch is a 500 from Postgres. Fix the maths, never the CHECK.

## Steps
1. Write the worked example by hand first, in the test, with every intermediate value:
   ```ts
   // 22K, 31,800 mg @ 1,054,000 paise/g, making PER_GRAM 65,000 paise/g
   // gold 33,517,200 · making 2,067,000 · unit 35,584,200 · GST(3%) 1,067,526 · total 36,651,726
   assert.deepEqual(priceDesign({ netWeightMg: 31800, ratePaisePerGram: 1054000, makingChargeType: 'PER_GRAM', makingChargeValue: 65000, stoneValuePaise: 0 }),
     { goldValuePaise: 33517200, makingPaise: 2067000, stonePaise: 0, otherPaise: 0, unitPricePaise: 35584200, gstPaise: 1067526, totalWithGstPaise: 36651726 });
   ```
   Add edge cases: a `.5` paise tie (half-up), zero stone, PERCENT making, a multi-line order where per-line GST would differ from subtotal GST by 1 paisa, and the largest realistic piece (safe-integer check).
2. Run red, then change the code.
3. Keep the formula in `packages/shared/src/pricing.ts`. The API calls it through `price()` in `apps/api/src/core/rates.ts`, and the web calls it only for display.
4. If a stored shape changes (new component column), it is a migration (`write-migration`) plus a snapshot field on `OrderItem` (never derived later).
5. Run `pnpm --filter @jewelroute/shared test`, `pnpm --filter @jewelroute/api test` (test 8: snapshot unchanged after a rate change), and `pnpm verify`.

## Related
- Write the test with `tdd`. Schema changes for new amounts: `write-migration`. Review: `invariant-reviewer`.
