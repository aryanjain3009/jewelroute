# AUDIT-SYNC — backend ↔ UI sync audit (final backend audit, 21 Oct 2026)

Base: `bd41191`. Scope: every API endpoint (from the controllers, not the docs), every web route and web API call
(read-only), the `Change → AFFECTS` map in `apps/web/src/lib/sync.ts`, and persisted state on real Postgres.
Proof: `apps/api/test/audit.test.ts` A1–A14 (asserts DB rows, outbox, ledger, idempotency keys — not just status codes).

Legend — **Idem**: `REQ` = `Idempotency-Key` required (400 without), `opt` = honoured when sent, `nat` = no key but a
retry cannot duplicate (unique index / state guard → 409), `—` = none. **Scope**: `T` = tenant from JWT, other-tenant
id → 404; `A` = agent sees only own rows (other agent → 404), admin any in tenant; `pub` = public. **Fan-out**: every
outbox row is fanned out by the dispatcher to active endpoints subscribed to its type (or `*`), signed, 1 + 6 retries.

## 1. Endpoint inventory (89 routes)

Guards: `AuthGuard` (JWT → **now also requires the user to be active in its tenant**, `401 ACCOUNT_DISABLED`) +
`@Requires('field'|'admin')` (ADMIN has `field` too) + `AppThrottlerGuard` (1200/min/route/IP; login 10/min per IP+email).

### Field / visits (`modules/visits.ts`, `orders.ts`, `memos.ts`, `uploads.ts`, `records.ts`)
| # | Method path | Guard | Idem | Scope | Tables written (constraints) | Outbox |
|---|---|---|---|---|---|---|
| 1 | GET /v1/field/today | field | — | T, own | — | — |
| 2 | GET /v1/visits/:id | field | — | T, A | — | — |
| 3 | POST /v1/visits/:id/geofence-check | field | — | T, A | — (read) | — |
| 4 | POST /v1/visits/:id/check-in | field, assigned agent only (admin → 403) | opt + nat | T, A | Visit status/checkIn*/verification (`Visit_one_open_per_agent`), IdempotencyKey | visit.checked_in |
| 5 | POST /v1/visits/:id/proofs | field, assigned agent | opt + nat (visitId+checksum unique) | T, A | VisitProof, Visit ACTIVE/startedAt, IdempotencyKey | visit.proof_uploaded |
| 6 | POST /v1/visits/:id/notes | field | **—** | T, A | VisitNote | — |
| 7 | POST /v1/visits/:id/complete | field, assigned agent | opt + nat | T, A | Visit COMPLETED/completed* | visit.completed |
| 8 | GET /v1/visits/:id/catalog | field | — | T, A | — | — |
| 9 | GET /v1/visits/:id/credit | field | — | T, A, open visit | — | — |
| 10 | POST /v1/orders | field, assigned agent | **REQ** | T, A | Order (`Order_totals`, `Order_no_submitted`, clientOpId unique), OrderItem (append-only, `OrderItem_values`), DocSequence, AuditLog, IdempotencyKey; Shop FOR UPDATE | order.created + order.confirmed \| order.pending_approval |
| 11 | GET /v1/orders/:id | field | — | T, A | — | — |
| 12 | POST /v1/memos | field, assigned agent | **REQ** | T, A | Memo, MemoItem (`MemoItem_one_out_per_piece`), SamplePiece (`SamplePiece_custodian_consistent`), CustodyEvent (append-only, unique pieceId+seq), DocSequence, AuditLog ×2, IdempotencyKey (ack link sealed) | sample.custody_changed + memo.created |
| 13 | GET /v1/memos/:id | field | — | T, A | — | — |
| 14 | POST /v1/memos/:id/return | field | **REQ** | T, A | MemoItem RETURNED, Memo status/closedAt, SamplePiece, CustodyEvent MEMO_RETURN, AuditLog ×2, IdempotencyKey | sample.custody_changed + memo.returned |
| 15 | POST /v1/memos/:id/extend | field | nat (date must move forward) | T, A | MemoExtension, Memo dueDate/overdueNotifiedAt, AuditLog | memo.extended |
| 16 | GET /v1/memos/:id/convert-preview | field | — | T, A | — | — |
| 17 | POST /v1/memos/:id/convert | field | **REQ** | T, A | SamplePiece SOLD, CustodyEvent CONVERTED_TO_SALE, MemoItem CONVERTED, Memo, Order + OrderItem (pieceId, sourceMemoId; deferred `SamplePiece_sold_has_live_order`), DocSequence, AuditLog ×3, IdempotencyKey | sample.custody_changed, order.created, order.confirmed \| pending_approval, memo.converted |
| 18 | POST /v1/memos/:id/ack/verify | field | nat | T, A | Memo ackStatus/At/Method or ackAttempts, AuditLog | memo.acknowledged |
| 19 | POST /v1/memos/:id/ack/link | field | — (reissue) | T, A | Memo ackTokenHash/ackCodeHash/expiresAt/attempts (**no audit row**) | — |
| 20 | GET /v1/public/memo-ack/:token | pub (30/min) | — | token | — | — |
| 21 | POST /v1/public/memo-ack/:token | pub (10/min) | nat (conditional update) | token | Memo ack*, AuditLog (actor null) | memo.acknowledged |
| 22 | POST /v1/uploads/proof-token | field | — | T, own open visit | — | — |
| 23 | POST /v1/uploads/direct | field | nat (tenant+objectKey upsert) | T, own open visit | StoredFile | — |
| 24 | GET /v1/files/:id | any auth | — | T; agent: own visits' files | — | — |
| 25 | GET /v1/field/visits | field | — | T, own | — | — |
| 26 | GET /v1/field/catalog | field | — | T, own bag | — | — |
| 27 | GET /v1/field/profile | field | — | T, own | — | — |

### Admin (`modules/admin.ts`, `orders.ts`, `memos.ts`, `records.ts`)
| # | Method path | Idem | Tables written | Outbox |
|---|---|---|---|---|
| 28 | GET /v1/admin/dashboard | — | (read; kicks dispatcher ≤1/10 s) | — |
| 29 | GET /v1/admin/home | — | (read; kicks dispatcher) | — |
| 30 | GET /v1/admin/activity | — | — | — |
| 31 | GET /v1/admin/settings | — | — | — |
| 32 | PATCH /v1/admin/settings | — | Tenant threshold/demoMode, AuditLog | — |
| 33 | POST /v1/admin/assignments | nat (agent+shop+date unique) | Visit, AuditLog | — |
| 34 | DELETE /v1/admin/assignments/:visitId | nat | Visit CANCELLED, AuditLog | — |
| 35 | GET /v1/admin/gold-rates | — | — | — |
| 36 | POST /v1/admin/gold-rates | **opt (new)** | GoldRate (append-only), AuditLog | — (`rate` kind reserved) |
| 37 | POST /v1/admin/shops | **opt (new)** | Shop, DocSequence, AuditLog | — |
| 38 | PATCH /v1/admin/shops/:id | — | Shop (FOR UPDATE), AuditLog | — |
| 39 | GET /v1/admin/designs | — | — | — |
| 40 | POST /v1/admin/designs | nat (SKU unique) | JewelryDesign, AuditLog | — |
| 41 | PATCH /v1/admin/designs/:id | — | JewelryDesign, AuditLog | — |
| 42 | POST /v1/admin/designs/:id/pieces | **opt (new)** | SamplePiece VAULT seq 1, CustodyEvent INTAKE, DocSequence, AuditLog | — |
| 43 | GET /v1/admin/pieces/:id/history | — | — | — |
| 44 | POST /v1/admin/pieces/issue | nat (custody guard → 409) | SamplePiece, CustodyEvent ISSUE_TO_AGENT, AuditLog | sample.custody_changed |
| 45 | POST /v1/admin/pieces/return-to-vault | nat | SamplePiece, CustodyEvent RETURN_TO_VAULT, AuditLog | sample.custody_changed |
| 46 | GET /v1/admin/agents | — | — | — |
| 47 | POST /v1/admin/agents | nat (email unique) | User, AuditLog | — |
| 48 | PATCH /v1/admin/agents/:id | — | User, RefreshToken revoked (deactivate), AuditLog | — |
| 49 | GET /v1/admin/audit | — | — | — |
| 50–61 | GET /v1/admin/{search, shops, shops/:id, visits, visits/:id, agents/:id, orders, orders/:id, memos, memos/:id, pieces, pieces/:id} | — | — | — |
| 62 | GET /v1/admin/shops/:id/credit | — | — | — |
| 63 | POST /v1/admin/orders/approve (batch) | nat (state machine, per-order tx) | Order, AuditLog | order.approved ×n |
| 64 | POST /v1/admin/orders/:id/approve | nat | Order status/decided* (Memo → pieces → Shop lock order), AuditLog | order.approved |
| 65 | POST /v1/admin/orders/:id/reject | nat | Order REJECTED; converted: SamplePiece SOLD→SHOP, CustodyEvent SALE_REJECTED, MemoItem OUT, Memo, AuditLog ×3 (deferred `Order_dead_unsells_pieces`) | order.rejected (+ sample.custody_changed) |
| 66 | POST /v1/admin/orders/:id/settle | nat | Order settledAt, AuditLog | order.settled |
| 67 | POST /v1/admin/orders/:id/cancel | nat | Order CANCELLED/cancelled*, AuditLog | order.cancelled |
| 68 | POST /v1/admin/memos/:id/extend | nat | as #15 | memo.extended |

### Webhooks, auth, ops
| # | Method path | Guard | Tables written | Outbox |
|---|---|---|---|---|
| 69–72 | POST /v1/auth/login · /refresh · /logout · GET /v1/auth/me | pub (login 10/min, refresh 30/min) / auth | RefreshToken insert / rotate (reuse → family revoked) / revoke | — |
| 73 | GET /v1/admin/webhooks/event-types | admin | — | — |
| 74 | GET /v1/admin/webhooks | admin | — | — |
| 75 | POST /v1/admin/webhooks | admin | WebhookEndpoint (secret AES-GCM), AuditLog | — |
| 76 | GET /v1/admin/webhooks/deliveries | admin | (read; kicks dispatcher) | — |
| 77 | GET /v1/admin/webhooks/deliveries/:id | admin | — | — |
| 78 | POST /v1/admin/webhooks/deliveries/:id/retry | admin | WebhookDelivery, WebhookAttempt | — (re-sends the same event id) |
| 79 | GET /v1/admin/webhooks/received | admin | — | — |
| 80 | PATCH /v1/admin/webhooks/:id | admin | WebhookEndpoint, AuditLog | — |
| 81 | DELETE /v1/admin/webhooks/:id | admin | WebhookEndpoint active=false, WebhookDelivery → DEAD, AuditLog | — |
| 82 | POST /v1/admin/webhooks/:id/rotate-secret | admin | WebhookEndpoint, AuditLog | — |
| 83 | GET /v1/admin/webhooks/:id/secret | admin | AuditLog (reveal) | — |
| 84 | POST /v1/admin/webhooks/:id/test | admin | OutboxEvent `ping` (targeted), WebhookDelivery, WebhookAttempt | ping (this endpoint only, even if disabled) |
| 85 | GET /v1/health | pub | — | — |
| 86–87 | POST · GET /v1/internal/dispatch | cron secret | Memo overdueNotifiedAt, Visit MISSED sweep, OutboxEvent fannedOutAt, WebhookDelivery, WebhookAttempt | memo.overdue |
| 88 | POST /v1/internal/seed | cron secret | wipes + recreates tenant `aurum` | seeded history |
| 89 | POST /v1/dev/webhook-receiver/:token | pub, gated | ReceivedWebhook | — |

Catalogue check: every type the code emits (`visit.checked_in|proof_uploaded|completed`, `order.created|confirmed|pending_approval|approved|rejected|settled|cancelled`,
`memo.created|extended|returned|converted|overdue|acknowledged`, `sample.custody_changed`, plus targeted `ping`) is in
`packages/shared/src/events.ts` `WEBHOOK_EVENT_TYPES` / `EVENT_DESCRIPTIONS`. **No uncatalogued event type.** The seed emits the same set.

## 2. Domain sync tables — UI action → API → service → DB → outbox → webhook → Change → AFFECTS → screens

Key names are `qk.*` from `lib/sync.ts`. **Gap** lists screens that render the changed fact but are not in `AFFECTS`.
"Same session" gaps are real bugs (the writer's own other screens stay stale until focus/poll); "cross-user" gaps are
covered only by polling/focus refetch and are listed for completeness.

### 2.1 Field visit
| UI action | API | Service | DB mutation | Outbox → webhook | Change | AFFECTS | Screens that must update | Gap |
|---|---|---|---|---|---|---|---|---|
| Visit page › Check in (`check-in-panel.tsx:72`) | POST visits/:id/check-in | `VisitsService.checkIn` | Visit CHECKED_IN, checkIn*, verification; partial unique one-open-visit | visit.checked_in → subscribers | visit.checked_in | today, visit, field-visits, home, dashboard, admin-visits, admin-visit, shop, shops, agent, agents, activity | Today, Visit, Visits; admin home/map, visits, visit record, shop, agents; **samples list/record** (PieceRow.location → "in visit") | cross-user: `pieces`, `piece` |
| Visit page › geofence preview | POST geofence-check | `geofenceCheck` | — | — | — | (`geofence` polled 5 s) | Check-in panel | — |
| Proof capture (`proof.tsx`, `proof-upload.ts`) | POST uploads/proof-token → uploads/direct → visits/:id/proofs | `UploadsService.token/direct`, `VisitsService.addProof` | StoredFile; VisitProof (unique visitId+checksum); Visit ACTIVE | visit.proof_uploaded | visit.proof_uploaded | as check-in | resume.canSell (Visit), proofState (admin visits/home) | — |
| Visit drawer › Add note (`visit-drawers.tsx:51`) | POST visits/:id/notes | `addNote` | VisitNote | — | visit.note_added | visit, admin-visit, shop, activity | Visit, admin visit record | none (API: no idempotency → a retry duplicates the note, Low) |
| Visit drawer › Complete (`visit-drawers.tsx:77`) | POST visits/:id/complete | `complete` | Visit COMPLETED | visit.completed | visit.completed | check-in set + profile | Today, Visit, Visits, Profile (week.visitsCompleted), admin | cross-user: `pieces`, `piece` (location → last check-in) |

### 2.2 Orders & approval
| UI action | API | Service | DB mutation | Outbox | Change | AFFECTS | Screens | Gap |
|---|---|---|---|---|---|---|---|---|
| Sale › Order review › credit preview (`order-review.tsx:43`) | GET visits/:id/credit | `OrdersService.visitCredit` | — | — | — | `credit` (staleTime 10 s) | Order review | — |
| Sale › Place order (`order-review.tsx:58`) | POST /orders (REQ key) | `OrdersService.create` → `createInTx` | Order, OrderItem (frozen rate), DocSequence, AuditLog, Shop lock | order.created + order.confirmed/pending_approval | order.created | credit, convert-preview, orders, order, visit, admin-visit, today, shop, shops, agent, agents, home, dashboard, activity, profile | Visit, Today, Profile, **Visits list (outcome order count/value — `visits-view.tsx:79-94`)**, admin lists | **same session: `fieldVisits`**; cross-user: `adminVisits` |
| Admin order record / list › Approve (`orders/[id]/page.tsx:44`, `orders/page.tsx:58`, `previews.tsx:42`) | POST admin/orders/:id/approve, /approve (batch) | `decide`, `approveMany` | Order APPROVED, decided* | order.approved | order.decided | orders, order, home, dashboard, shop, shops, admin-visit, visit, activity, credit, convert-preview, agent, agents, today | Orders, order record, home, shop credit | — |
| Admin › Reject (`orders/[id]/page.tsx:48`) | POST admin/orders/:id/reject | `decide` + `unsell` | Order REJECTED; converted: custody SOLD→SHOP, MemoItem OUT, Memo status | order.rejected (+custody_changed) | order.decided (+order.unsold if `sourceMemoId`) | + custody set | + **Visits list outcome (REJECTED excluded)** | **same session: `adminVisits`** (admin visits list outcome) |
| Admin › Settle (`orders/[id]/page.tsx:37`) | POST admin/orders/:id/settle | `settle` | Order settledAt | order.settled | order.settled | orders, order, shop, shops, credit, convert-preview, home, dashboard, activity, agent | Order record, shop credit/lastOrder | — |
| Admin › Cancel (`orders/[id]/page.tsx:40`) | POST admin/orders/:id/cancel | `cancel` | Order CANCELLED | order.cancelled | order.cancelled | … incl. admin-visit, visit, today, profile | + **admin Visits list outcome (CANCELLED excluded)** | **same session: `adminVisits`** |
| Field visit polling sees a decision (`queries.ts:44`) | GET visits/:id | — | — | — | order.decided (+unsold) | as above | **Visits list outcome, Profile week.ordersValuePaise (REJECTED excluded)** | **same session: `fieldVisits`, `profile`** |

### 2.3 Memos & custody (field)
| UI action | API | Service | DB mutation | Outbox | Change | AFFECTS | Screens | Gap |
|---|---|---|---|---|---|---|---|---|
| Sale › Leave on memo (`memo-review.tsx:49`) | POST /memos (REQ) | `MemosService.create` | Memo, MemoItem OUT, custody AGENT→SHOP (+event), DocSequence, AuditLog | sample.custody_changed + memo.created | memo.created | custody set (credit, convert-preview, pieces, piece, profile, catalog, designs, memos, memo, shop, shops, agent, agents, today, visit, admin-visit, home, dashboard, activity) | Visit, Today bag, Profile, catalog availability, **Visits list (outcome.memoCount)** | **same session: `fieldVisits`**; cross-user: `adminVisits` |
| Memo ack › Verify code (`memo-ack.tsx:41`) | POST memos/:id/ack/verify | `verifyCode` | Memo ack* | memo.acknowledged | memo.acknowledged | memos, memo, visit, admin-visit, shop, piece, pieces, home, activity | Memo ack screen, Visit resume.pendingAcks | — (new `410 ACK_EXPIRED` not handled, see §5) |
| Memo ack › Reissue link (`memo-review.tsx:55`, `workspace.tsx:281`) | POST memos/:id/ack/link | `reissueAck` | Memo ack token/code hashes | — | — (local state) | — | QR screen | — |
| Retailer phone › Confirm receipt (`/ack/[token]`, `ack-view.tsx:15`) | GET/POST public/memo-ack/:token | `publicView/publicConfirm` | Memo ack* | memo.acknowledged | — (public page) | agent's memo-ack polls visit every 3 s | Agent memo-ack | — |
| Visit drawer › Return (`visit-drawers.tsx:130`) | POST memos/:id/return (REQ) | `returnPieces` | MemoItem RETURNED, custody SHOP→AGENT | sample.custody_changed + memo.returned | memo.returned | custody set | Visit (returns), bag, **Visits list (outcome.returnedCount)** | **same session: `fieldVisits`** |
| Visit drawer › Convert preview / Sell (`visit-drawers.tsx:211,227`) | GET convert-preview, POST memos/:id/convert (REQ) | `convertPreview`, `convert` | custody SHOP→SOLD, MemoItem CONVERTED, Order(+items) | custody_changed, order.created, order.confirmed/pending, memo.converted | memo.converted | custody set + orders, order | Visit, **Visits list (orders + memos outcome)** | **same session: `fieldVisits`** |
| Visit drawer › Extend (`visit-drawers.tsx:362`) / admin memo record › Extend (`memos/[id]/page.tsx:151`) | POST memos/:id/extend · admin/memos/:id/extend | `extend` | MemoExtension, Memo dueDate, overdueNotifiedAt=null | memo.extended | memo.extended | memos, memo, home, dashboard, shop, visit, admin-visit, activity | **Today (activeMemos.overdueCount `today-view.tsx:110`), Profile (memo due `profile-view.tsx:93`), Samples list/record (OVERDUE→ON_MEMO, memo.dueDate), Shops list (status MEMO_OVERDUE), Agents list/record (openMemos.overdueCount `agents-list.tsx:67`)** | **same session: field `today`, `profile`; admin `pieces`, `piece`, `shops`, `agents`, `agent`** |

### 2.4 Samples, catalog, gold rate (admin)
| UI action | API | Service | DB mutation | Outbox | Change | AFFECTS | Screens | Gap |
|---|---|---|---|---|---|---|---|---|
| Agent record / sample › Issue (`agent-record.tsx:225`, `piece-actions.tsx:37`) | POST admin/pieces/issue | `AdminService.issue` → `CustodyService.move` | custody VAULT→AGENT | sample.custody_changed | piece.moved | custody set | samples, agent, home | — |
| Return to vault (`agent-record.tsx:185`, `piece-actions.tsx:70`) | POST admin/pieces/return-to-vault | `returnToVault` | custody AGENT→VAULT | sample.custody_changed | piece.moved | custody set | same | — |
| Catalog › design sheet › Take into vault (`design-sheet.tsx:56`) | POST admin/designs/:id/pieces | `intake` | SamplePiece, CustodyEvent INTAKE | — (no event) | design.saved + piece.moved | designs, catalog, pieces + custody | Catalog, samples | web sends no Idempotency-Key (now honoured) |
| Catalog › Save design (`design-sheet.tsx:53`) | POST/PATCH admin/designs | `createDesign/patchDesign` | JewelryDesign | — | design.saved | designs, catalog, pieces | Catalog, samples list, **sample record (design block)** | same session: `piece` (Low) |
| Settings › Gold rate (`gold-rate.tsx:43`) | POST admin/gold-rates | `setRate` | GoldRate insert | — | gold_rate.set | goldRates, convert-preview, catalog, designs, pieces, piece, home, dashboard, profile, shops, shop, agents, agent, activity | rate badge (shell), catalog prices, sample values | cross-user: field `today` (bag value), `visit` (bag/catalog); web sends no Idempotency-Key |

### 2.5 Shops, agents, assignments, settings, integrations
| UI action | API | Service | DB mutation | Change | AFFECTS | Screens | Gap |
|---|---|---|---|---|---|---|---|
| Shops › New / Edit / Assign agent (`dialogs.tsx:42,131,164`, `shops-list.tsx:158`) | POST/PATCH admin/shops | `createShop/patchShop` | Shop (FOR UPDATE on PATCH) | shop.saved (+agent.saved) | shops, shop, credit, convert-preview, home, dashboard, today, activity | shop lists/record, credit | same session: `adminVisits`, `adminVisit` (shop name/area/geofence), `orders`, `memos` (shop name) — Low; cross-user: field `visit`, `geofence(visitId)` (radius/coords) |
| Visits › Assign / Remove (`dialogs.tsx:54,121`) | POST/DELETE admin/assignments | `assign/unassign` | Visit | visit.assigned | check-in set | visits, agent today, shop next visit | cross-user: field Today has no poll (focus only) |
| Agents › New / Edit / Deactivate (`dialogs.tsx:216,251`) | POST/PATCH admin/agents | `createAgent/patchAgent` | User, RefreshToken revoke | agent.saved | agents, agent, home, dashboard | agents | same session: `adminVisits`, `shops`, `shop`, `pieces` (agent names) — Low |
| Settings › threshold / demo mode (`settings/page.tsx:67`) | PATCH admin/settings | `patchSettings` | Tenant | settings.saved | settings, credit, convert-preview, shops, shop, me | settings, credit | — |
| Integrations › add / edit / disable / delete / rotate / test / retry (`integrations.tsx`) | POST/PATCH/DELETE admin/webhooks…, deliveries/:id/retry | `WebhooksService.*`, `Dispatcher.retryNow` | WebhookEndpoint, WebhookDelivery, WebhookAttempt | webhook.changed | webhooks, deliveries, delivery, received, home | integrations, home attention | — (copy: see §5) |

### 2.6 Screens no invalidation reaches
- `qk.dashboard` is in many `AFFECTS` rows but **no screen queries it** (and the web never calls `GET /admin/dashboard`) — dead key.
- Field **Today** (`qk.today`) has no `refetchInterval`; admin-side changes (assignment, unassign, gold rate → bag value, memo extend by admin) reach the agent only on focus/remount.
- `qk.search` (⌘K) is never invalidated (15 s staleTime) — Low.
- Background dispatcher writes (`memo.overdue`, MISSED sweep, delivery retries) have no `Change`; they surface through polling only (home 10 s, deliveries 5 s, memos/pieces 20 s). Fine.
- UI calls to non-existent endpoints: **none** (every `api()` / `fetch` call site under `apps/web/src` resolves to a route in §1).

## 3. Web routes → API calls → query keys
| Route | Main component | API calls | Keys |
|---|---|---|---|
| /field/today | `field/today-view` | GET field/today | today |
| /field/visits | `field/visits-view` | GET field/visits?scope= | field-visits |
| /field/visits/[id] | `field/visit-view`, `workspace`, `visit-drawers`, `check-in-panel`, `proof` | GET visits/:id; POST check-in, geofence-check, proofs, notes, complete; uploads/*; memos/:id/{return,convert,extend,ack/link}; GET convert-preview | visit, geofence, convert-preview |
| /field/visits/[id]/sale | `field/sale/sale-view`, `order-review`, `memo-review`, `memo-ack`, `catalog-grid` | GET visits/:id/catalog, visits/:id/credit; POST orders, memos, memos/:id/ack/{verify,link} | catalog, credit, visit |
| /field/catalog · /field/profile | `catalog-browse` · `profile-view` | GET field/catalog · field/profile | catalog · profile |
| /ack/[token] | `field/ack-view` | GET/POST public/memo-ack/:token (raw fetch) | — (polls) |
| /login | `login-form` | POST auth/login | — |
| /admin | `admin-v2/field/home` | GET admin/home, admin/activity | home, activity |
| /admin/visits · /[id] | data-table + `visit-record` | GET admin/visits, admin/agents, admin/visits/:id; DELETE/POST assignments | admin-visits, agents, admin-visit |
| /admin/shops · /[id] | `shops-list`, `shop-record`, `dialogs` | GET admin/shops, shops/:id; POST/PATCH shops | shops, shop |
| /admin/agents · /[id] | `agents-list`, `agent-record` | GET admin/agents, agents/:id, pieces?custodianType=VAULT; POST/PATCH agents; pieces/issue, return-to-vault | agents, agent, pieces |
| /admin/orders · /[id] | data-table, `previews` | GET admin/orders, orders/:id, memos/:id; POST orders/approve, :id/{approve,reject,settle,cancel} | orders, order, memo |
| /admin/memos · /[id] | data-table, record | GET admin/memos?filter=all, memos/:id; POST admin/memos/:id/extend | memos, memo |
| /admin/samples · /[id] | data-table, `piece-actions` | GET admin/pieces, pieces/:id, admin/shops; POST pieces/issue, return-to-vault | pieces, piece, shops |
| /admin/catalog | `design-sheet` | GET admin/designs, gold-rates; POST/PATCH designs, designs/:id/pieces | designs, gold-rates |
| /admin/integrations | `sales/integrations` | GET/POST/PATCH/DELETE admin/webhooks…, deliveries, received, event-types, secret, test, retry | webhooks, deliveries, delivery, received, event-types |
| /admin/settings | settings page, `gold-rate` | GET/PATCH admin/settings; POST gold-rates | settings, gold-rates |
| (shell, ⌘K) | `app/shell`, `command-menu` | GET admin/gold-rates, admin/search, auth/me | gold-rates, search, me |

## 4. API findings
| # | Sev | Finding | Status |
|---|---|---|---|
| B1 | **High** | A deactivated agent's access token kept working for up to 15 min — probe booked an order (201) after `PATCH /admin/agents/:id {active:false}`; tokens of deleted users (after a reseed) also passed the guard. | **Fixed `d4d6296`**: `AuthGuard` requires an active user in the token's tenant → `401 ACCOUNT_DISABLED` (A13). One PK lookup per authenticated request. |
| B2 | Medium | `POST /memos` stored the ack link (bearer capability: public page shows the code and confirms receipt) in plain text in `IdempotencyKey.responseBody`, contrary to "only hashes at rest". | **Fixed `0ec71ca`**: `IdempotencyService.run(..., StoredForm)` seals it with AES-GCM; replays stay identical (A2, F9). Old rows: links expire in ≤72 h. |
| B3 | Medium | `POST /memos/:id/ack/verify` accepted the code of an expired link (public page already 410). | **Fixed `0ec71ca`**: `410 ACK_EXPIRED`, no attempt counted (A12). |
| B4 | Medium | Intake (`POST /admin/designs/:id/pieces`) creates custody state with no idempotency — a retried submit creates duplicate VAULT pieces; same for gold rates (duplicate rows) and shops (twin shop with credit limit + opening balance). | **Fixed `b006ee8`** (API): optional `Idempotency-Key` honoured on all three (A14). Web must send it (§5). |
| B5 | Medium | Login throttle trusts the first `X-Forwarded-For` entry: 14 spoofed attempts → never 429 (12 un-spoofed → 429 after 10). | **Fixed `cd3a87d`**: `TRUST_PROXY` hops (unset: 1 on Vercel, 0 elsewhere), tracker uses `req.ip` (A16). Review note: behind the web rewrite `req.ip` may be the web egress — set `TRUST_PROXY` to the real hop count per deployment |
| B6 | Medium | Webhook URLs may target private/loopback addresses (prod only enforces https) and the response body (2 kB) is shown to admins → SSRF read. | **Fixed `05888a8`, hardened `43fcaf2`** (review m1–m4): exact own-receiver origin + path, 6to4/Teredo/NAT64-local/discard blocked, `WEBHOOK_ALLOW_PRIVATE` ignored in production (non-demo), generic messages, 3 s DNS timeout (E1–E3) |
| B7 | Medium | Two tabs refreshing with the same `jr_rt` at once: one 200, the other 401 (probe 8/8); the web then redirects that tab to /login although cookies were rotated. If the loser lands after the winner commits, reuse detection revokes the whole family, including the new session. | **Fixed `c48a70a`, redesigned `d168cac`** (review M1): ONE grace reuse per rotated token, same user agent, under a per-user advisory lock + row lock, returning the SAME successor; any other reuse revokes the family; logout = one session, new `logout-all` (A15). Schema `1736cd4`, `1fe6f56` |
| B8 | Medium (design) | The agent receives the ack URL, so it can open the retailer page and confirm receipt itself; "acknowledged" is not independent proof. | **Mitigated `04ed72c`, redesigned `9d8b39f`** (review M3): triggers are the agent's session or the `jr_dev` device cookie only; IP/UA kept as evidence and cleared after 90 days (`34eb0eb`); surfaced on Memo, custody note and `ACK_SELF_SUSPECTED` (A17, A20) |
| B9 | Low | `POST /memos` validates `dueDate` before the idempotency replay, so a retry after IST midnight with `dueDate` = the old "today" gets 400 instead of the stored response. | **Fixed `04ed72c`**: the check runs inside `idem.run`, after a stored response is replayed (A18, simulated with a pre-stored key row). |
| B11 | Medium | (review M2) Request logs carried the ack and demo-receiver tokens in the URL. | **Fixed `193ad6e`**: `redactUrl` in the pino-http serializer and the 5xx log (L1, L2). |
| B12 | Low | (review m6, m7, m8, m9, m10) no `RefreshToken(userId)` index and no token purge; retailer IP/UA kept forever; logout cleared grace for every device; guard write could 500 on a vanished user; blank owner/phone stored as `""`. | **Fixed** `1fe6f56` (index), `34eb0eb` (purge + 90-day evidence retention), `d168cac` (logout scope, guard no longer writes, blank → null) (A15, A20, A21). |
| B10 | Low | `POST /visits/:id/notes` had no idempotency (retry duplicated a note) — **fixed: optional key honoured (A19)**; `POST /memos/:id/ack/link` writes no audit row; intake emits no outbox event (new stock invisible to activity/webhooks). | Not fixed — not money/custody. |
| — | Info | Disabled/deleted webhook endpoints get no delivery rows for events emitted while inactive (fan-out filters `active`); queued ones are parked DEAD without an attempt. Contract wording clarified. | Doc only. |

Verified OK (tests A1–A11, no bug): one open visit under replay/second visit/6-way race; order & memo idempotency incl. 6–8-way concurrent bursts; GPS validation (±90/±180, NaN, 1e999, strings, missing, negative accuracy, 50 m slack cap, missing accuracy = no slack, SIMULATED on non-demo → 403); proof gate on order/memo/return/convert/preview with zero rows written; every custody refusal leaves custodian, custodySeq, ledger and OUT items unchanged; 17 reads + 34 writes cross-tenant and 20 cross-agent → 404 with both tenants' rows byte-identical; JWT expired/forged/none/tampered/HS512/wrong issuer; refresh rotation, reuse revocation, logout, deactivation; 53 admin routes → 403 for agents; cron routes need the secret; rate snapshot + append-only triggers; memo ledger rows per transition and rollback mid-transaction (memo create and convert); approval boundaries, threshold changed between preview and write, full state machine incl. a 3-way approve/cancel/reject race; webhook ladder, DEAD, manual retry, signatures, at-least-once, disabled endpoint never called.

## 5. For the web auditors
- `apps/web/src/lib/sync.ts` `AFFECTS["order.created"]`, `["memo.created"]`, `["memo.returned"]`, `["memo.converted"]`: add **`qk.fieldVisits`** (field Visits list renders `outcome` — `components/field/visits-view.tsx:79-94`) and `qk.adminVisits` (admin visits list `outcome`).
- `AFFECTS["order.decided"]`, `["order.cancelled"]`, `["order.unsold"]`: add **`qk.adminVisits`** (outcome excludes REJECTED/CANCELLED) and `qk.fieldVisits`; `order.decided` also **`qk.profile`** (week.ordersValuePaise excludes REJECTED; fired by `components/field/queries.ts:44`).
- `AFFECTS["memo.extended"]`: add **`qk.today`** (`today-view.tsx:110` overdueCount), **`qk.profile`** (`profile-view.tsx:93`), **`qk.pieces`, `qk.piece()`** (status OVERDUE→ON_MEMO, memo due date), **`qk.shops`** (status MEMO_OVERDUE), **`qk.agents`, `qk.agent()`** (`agents-list.tsx:67` overdueCount).
- `AFFECTS["shop.saved"]`: add `qk.adminVisits`, `qk.adminVisit()`, `qk.orders`, `qk.memos` (shop name/area in rows); `["agent.saved"]`: add `qk.adminVisits`, `qk.shops`, `qk.shop()`, `qk.pieces` (agent names); `["design.saved"]`: add `qk.piece()`.
- `qk.dashboard` is never queried — drop it from `AFFECTS` or note it as reserved.
- Field Today (`components/field/queries.ts:12`): add a modest `refetchInterval` (e.g. 60 s) — admin assignments / extensions / rate changes otherwise appear only on focus.
- `components/field/sale/memo-ack.tsx:46`: every 4xx is shown as "That code doesn't match"; handle **`410 ACK_EXPIRED`** ("link expired — reissue") by calling `POST /memos/:id/ack/link` and showing the new QR.
- `lib/api.ts` `api()` 401 path: also handle **`ACCOUNT_DISABLED`** (refresh will fail → sign-in with a "your account was deactivated" message) and, when `refresh()` fails, **retry the original request once before redirecting** (another tab may have rotated the cookie — B7).
- Send an `Idempotency-Key` (one per submit, reused on retry) on `components/field/visit-drawers.tsx:51` (add note), `components/admin-v2/sales/design-sheet.tsx:56` (intake), `components/admin-v2/sales/gold-rate.tsx:43` (rate), `components/admin-v2/field/dialogs.tsx:42` (new shop).
- **Round 2:** `lib/types.ts` — add `Memo.selfAckSuspected` / `selfAckReason?`, `CustodyEventRow.ack.selfAckSuspected?` / `note?`, and `AttentionKind` **`ACK_SELF_SUSPECTED`**; render the note on the memo/sample custody timeline (`components/admin-v2/sales/custody-timeline.tsx`) and the attention row on Home (`components/admin-v2/field/home.tsx`), e.g. a warning chip "Acknowledged from the agent's device — confirm with the retailer". No new `Change` is needed: `memo.acknowledged` already invalidates `qk.home`, `qk.memo()`, `qk.piece()`.
- **Round 2:** `components/admin-v2/sales/integrations.tsx` endpoint form: show `422 WEBHOOK_URL_FORBIDDEN` messages inline (private/loopback URLs are now refused); local receivers need `WEBHOOK_ALLOW_PRIVATE=true` in `apps/api/.env`, the built-in receiver does not.
- **Round 2:** the `lib/api.ts` "retry once before redirecting" item is now optional (the API grace window makes two-tab refreshes succeed); keep the `ACCOUNT_DISABLED` handling.
- `components/admin-v2/sales/integrations.tsx:191` success copy "New deliveries are parked as dead letters" is wrong: events emitted while an endpoint is disabled are **not queued at all** (no delivery rows; re-enabling does not back-fill). Suggested: "Endpoint disabled. Events are not sent while it is off."
- `memo-review.tsx:53-55` (`ack: null` fallback) stays correct; replays now return the original link again.

## 6. Evidence
- `cd apps/api && npx tsc -p tsconfig.build.json && node --import tsx --test --test-concurrency=1 test/audit.test.ts` — before fixes: 10 pass / 4 fail (A2 plaintext token, A12 200≠410, A13 201 order, A14 duplicates); after: 14/14.
- `pnpm --filter @jewelroute/api test` — 64/64 before the A14 shop case, then the full gate below.
- `pnpm verify` ×2 — see the commit message / final report for receipts.
- Review fixes (`1fe6f56…fac552c`): every new test red first (A15/A17/A20/A21 and E1/E2/L1/L2 against stubs keeping the old behaviour), green after; full API suite 77/77; `prisma migrate diff` vs scratch shadow: no difference.
- Round 2 (`1736cd4…3f9c4a3`): A15–A18 and E2–E3 red before wiring (E1 is the new pure classifier), all green after; `prisma migrate diff` vs a scratch shadow DB: no difference; migrations applied to `jewelroute_test` only (the dev DB and :4000 untouched).
- Probes (throwaway, not committed): refresh race 8/8 → one 200 + one 401; spoofed XFF 14× 401 (no 429) vs plain 10× 401 then 429; deactivated token → order 201 (before B1).
- T3 process note: invariant-reviewer / verifier sub-agents were **not run** in this session (no sub-agent tool); a `docs/brain` note is owned by the lead — the decisions are recorded here and in the CONTRACT changelog.
