# Hot-path EXPLAIN (BACKLOG #20) — 22 Oct 2026, wt-conc

Re-run: `apps/api/scripts/explain-hot.ts` (usage in its header). `seed` builds a volume tenant with direct inserts that satisfy every CHECK and trigger (orders priced with `priceDesign`/`orderTotals`, contiguous custody ledger, outbox rows with `eventRefs`). `measure` boots `dist/main.js` on the scratch DB, switches on `auto_explain` (`log_min_duration = 0`, `ANALYZE`, `BUFFERS`) for that database only, calls each route after a warm-up, and attributes plans to the request by server-log offset and the API's backend pids. `EXPLAIN_NO_SEQSCAN=1` adds `enable_seqscan = off`: a Seq Scan that survives it has **no usable index**.

Scratch DB `jewelroute_explain` (local Postgres 16, Apple silicon). Its schema is a copy of the fully migrated test DB (all 15 migrations): `prisma migrate deploy` against it was held by the safety hook overnight, so I loaded `pg_dump -s` of `jewelroute_test_conc` instead and pinned `timezone = UTC` as migration `20261022000000` does.

## Volumes

| tenant | shops | orders (items) | outbox events | visits | memos | pieces |
|---|---|---|---|---|---|---|
| vol-small | 10 | 100 (199) | 400 | 30 | 10 | 40 |
| **vol-large (the brief)** | **50** | **500 (999)** | **2,000** | 120 | 50 | 200 |
| vol-xl2 (growth check) | 200 | 5,000 (9,999) | 20,000 | 1,020 | 200 | 800 |

## Statements per request (N+1 check)

App statements (Prisma's one-off `pg_catalog` type lookups on a fresh pool connection excluded).

| route | small | large | xl | grows with rows? |
|---|---|---|---|---|
| `GET /v1/admin/home` | 55 | 55 | 54 | no (one Shop lookup is skipped when a list is empty) |
| `GET /v1/admin/shops` | 13 | 13 | 13 | no |
| `GET /v1/admin/orders` | 7 | 7 | 7 | no |
| `GET /v1/admin/activity` | 9 | 9 | 9 | no |

No N+1: the record builders batch (`IN (…)`, `groupBy`, `DISTINCT ON`/`LATERAL`), as DECISIONS says. Home's 55 statements are many but constant; they run concurrently (`Promise.all`) on a 4-connection pool.

## Time (sum of statement execution time from auto_explain, ms; wall = HTTP round trip)

| route | large before | large after | xl before | xl after | xl wall / body after |
|---|---|---|---|---|---|
| home | 9.2 | 8.3 | 29.8 | 12.3 | 71 ms / 82 KB |
| shops | 7.4 | 7.4 | 42.8 | 34.6 | 45 ms / 247 KB |
| orders | 12.9 | 14.3* | 23.6 | 11.9 | 74 ms / 899 KB |
| activity | 2.1 | 2.2 | 1.8 | 1.2 | 13 ms / 69 KB |

\* noise at 500 rows; the plan change below is the point. Statement times include auto_explain's own timing overhead, so compare columns, not absolute values. The orders body is ~900 KB because the list returns up to 500 full orders — see open items.

## Findings and what changed

### 1. `GET /admin/orders` sorted every order of the tenant — index added
`views.orders(tid, where, { take: 500 })` = `WHERE "tenantId" = $1 ORDER BY "createdAt" DESC LIMIT 500` (⌘K search runs the same shape with `LIMIT 5`). No index led `(tenantId, createdAt)` (the existing ones put `status` or `shopId` second), so:

```
-- before, xl (5,000 orders)                                    actual 12.0 ms
Limit (rows=500)
  -> Sort  Sort Key: "createdAt" DESC  Sort Method: top-N heapsort  Memory: 1011kB
     -> Seq Scan on "Order"  (rows=5000)  Filter: ("tenantId" = '…')  Rows Removed by Filter: 600
        Buffers: shared hit=706
-- after                                                         actual 0.6 ms
Limit (rows=500)
  -> Index Scan Backward using "Order_tenantId_createdAt_idx" on "Order"
       Index Cond: ("tenantId" = '…')   Buffers: shared hit=504
```
Migration `20261022000100_order_tenant_created_idx` (`CREATE INDEX CONCURRENTLY IF NOT EXISTS`, alone in its file). Test X1 (`apps/api/test/records.test.ts`) asserts the plan uses it and has no Sort.

### 2. `MemoExtension` had no index but its primary key — index added
Every memo view (Home attention, memo lists, records) includes `extensions` → `WHERE "memoId" IN (…)`. The Seq Scan was the only one in all four routes that survived `enable_seqscan = off`, i.e. no index existed; it reads every tenant's extensions. Migration `20261022000110_memo_extension_memo_idx` on `("memoId")` (a relation lookup without `tenantId`, like `OrderItem_orderId_idx`). Test X1 asserts the plan uses it. (In the volume tenants the table is empty, so timings do not move; it matters as extensions accumulate.)

### 3. Shop list "last order" sorted every order of the tenant — query rewritten (no new index)
`shopRows` picked each shop's newest order with `DISTINCT ON (o."shopId") … ORDER BY "shopId", "createdAt" DESC, id DESC`, which reads and sorts all of the tenant's orders:

```
-- before, xl                                                    actual 21.7 ms
Unique (rows=200)
  -> Sort  Sort Key: "shopId", "createdAt" DESC, id DESC  (rows=5000)  Memory: 789kB
     -> Seq Scan on "Order" o  (rows=5000)  Buffers: shared hit=700
```
Now `unnest(shopIds) CROSS JOIN LATERAL (… WHERE "tenantId" = $1 AND "shopId" = s.id ORDER BY "createdAt" DESC, id DESC LIMIT 1)`: one probe per shop on the existing `Order_tenantId_shopId_createdAt_idx` (Index Scan). Same result, including the `id` tie-break; test X2 pins it (every row's `lastOrder` = that shop's newest order).

### Seq scans that remain (and why they are not index work)
With `enable_seqscan = off` every remaining scan switches to an index, so these are the planner's cost choice at this size, not missing indexes:
- `Shop … ORDER BY name` (Home's map, the shop list): reads all of the tenant's shops by design (200 rows: 2.7 ms).
- `/admin/shops` 30-day and unsettled totals: `groupBy shopId SUM(totalPaise)` over the tenant's orders (7.6 + 10.6 ms at 5,000 orders). An aggregate must read every row it sums; an index does not remove that. The fix at scale is a per-shop running balance, not an index.
- `/admin/shops` "last completed visit" (`DISTINCT ON` over the tenant's completed visits): 8 ms at 1,000 visits. Same rewrite as #3 would apply (needs an index on `("tenantId","shopId","completedAt")`); left for when visits reach tens of thousands.
- `/admin/orders` line items: `OrderItem WHERE "orderId" IN (500 ids)` picks a Seq Scan when those rows are ~10% of the table; `OrderItem_orderId_idx` exists and is used once the table is larger.
- Home `_count` of orders per visit: Prisma aggregates the tenant's orders by `visitId` and then joins (1.4 ms at 5,000 orders).

## Open items (not done)
- `/admin/orders` returns up to 500 full orders (~900 KB JSON once a tenant has 500 orders; 74–158 ms wall locally, most of it building and sending JSON). Cursor pagination (as the deliveries log has) is the fix; it is a contract change, so it is left for the lead.
- Per-shop running balance (exposure) if shop lists must stay flat past ~50k orders per tenant.
