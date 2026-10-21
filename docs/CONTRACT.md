# JewelRoute API contract (v1) — the single source both apps build against

Base: the NestJS API serves everything under `/v1`. The web app calls it **same-origin** through a Next.js rewrite `/api/:path* → ${API_ORIGIN}/:path*`, so the browser always calls `/api/v1/...` and auth cookies are first-party.

## Changelog
- **2026-10-21 (api, fixes after verification — `docs/VERIFY-REPORT.md` › Fixes after verification)** — behaviour changes:
  - **Arrival photo before any sale (server-enforced).** `POST /v1/orders`, `POST /v1/memos`, and `POST /v1/memos/:id/return|convert` when they act on a visit (explicit `visitId`, or the caller's open visit at the memo's shop) need ≥1 `VisitProof` on that visit → else `409 PROOF_REQUIRED_BEFORE_SALE` (details `{visitId}`); nothing is written and the Idempotency-Key is rolled back. A return/convert with no visit (no open visit at that shop) is unchanged.
  - `resume.canSell` is now `open && proofCount > 0` — it agrees with `nextStep` (`UPLOAD_PROOF` ⇒ `canSell:false`). Clients must gate every sell action on it.
  - `409 ORDER_ALREADY_DECIDED` (single approve/reject and inside batch results) reports the **committed** state after a lost race: message `Order ORD-… was already approved by Priya Mehta`, `details: { status: 'APPROVED'|'REJECTED', decidedBy?: {id,name}, decidedAt? }`.
  - `GET /v1/admin/webhooks/received?endpointId=` (optional) filters to one endpoint.
  - Demo receiver `POST /v1/dev/webhook-receiver/:token`: unknown token → `404` and nothing stored; `fail-…` token → `500` and nothing stored; bad/expired signature → stored with `signatureOk:false` and `401`. So every `signatureOk:true` row is a 200 delivery. Available only when `ENABLE_DEMO_RECEIVER=true`, or (unset) outside production, or in production for endpoints whose tenant has `demoMode`; `ENABLE_DEMO_RECEIVER=false` → always 404.
  - Gold-rate audit summaries show exact paise (`₹10,612.50/g`).
- **2026-10-21 (api)** — additive unless noted; all implemented and covered by `apps/api/scripts/e2e-smoke.ts`.
  - Status codes: creates (`orders`, `memos`, `proofs`, `notes`, `assignments`, `shops`, `designs`, `agents`, `gold-rates`, `webhooks`) return **201**; actions return 200. Always read the envelope.
  - Common errors: `400 VALIDATION_FAILED` (details = `[{path,message}]`), `401 UNAUTHENTICATED|TOKEN_EXPIRED|INVALID_TOKEN|INVALID_CREDENTIALS`, `403 FORBIDDEN`, `404 NOT_FOUND` (also for other-tenant / other-agent ids), `429 RATE_LIMITED`.
  - `POST /v1/auth/login` also returns `refreshToken` (for non-browser clients) and accepts optional `tenantSlug`. `POST /v1/auth/refresh` accepts `{refreshToken}` in the body when no cookie.
  - Check-in extra errors: `409 VISIT_NOT_TODAY` (plannedDate ≠ today IST), `409 VISIT_NOT_PLANNED`. Proofs/orders/memos on a visit that is not CHECKED_IN/ACTIVE → `409 VISIT_NOT_OPEN`. Complete twice → `409 VISIT_ALREADY_COMPLETED`.
  - Uploads (direct mode): proof-token returns `{mode:'direct', pathname, uploadUrl:'/api/v1/uploads/direct', maxBytes}`; `POST /v1/uploads/direct` multipart fields **`file` + `pathname`** (from proof-token) → `{url:'/api/v1/files/<id>', objectKey, checksumSha256, sizeBytes, contentType}`. `GET /v1/files/:id` serves it (authenticated via cookie, tenant-scoped, immutable cache). Proof errors: `422 INVALID_OBJECT_KEY | CHECKSUM_MISMATCH | OBJECT_NOT_FOUND | INVALID_URL`. Same checksum on the same visit returns the existing proof.
  - Memos: `400 INVALID_DUE_DATE` (today … today+90). Return/convert of a piece not outstanding → `409 PIECE_NOT_ON_MEMO`. Ack: wrong code → `422 ACK_CODE_INVALID`; 5th wrong → `423 ACK_LOCKED`; **new** `POST /v1/memos/:id/ack/link` → `{ack:{url,expiresAt}}` (reissue QR; resets attempts). Public page on an expired link → `410 ACK_EXPIRED`; public GET also returns `expiresAt`, item `sku`, `grossWeightMg`, `status`.
  - New reads: `GET /v1/orders/:id` → `{order}`, `GET /v1/memos/:id` → `{memo}` (agent: own only), `GET /v1/admin/orders/:id` → `{order}`, `GET /v1/admin/activity` (latest 100 ActivityItem), `POST /v1/admin/memos/:id/extend` (same as agent extend).
  - Shapes: `Piece` adds `category`, `custodySeq`; `Order` adds `itemCount`, `sourceMemoId?`, items add `pieceId?`, `goldRateId`; `Memo` adds `outstandingCount`, `closedAt?`; `Design.price` is `null` if the purity has no gold rate; `VisitSummary` adds `agent`, `checkInLat/Lng/AccuracyM`, `startedAt`, `summary`; `GET /v1/visits/:id` adds top-level `agent`. Dashboard adds `rates`, `visits` (all of the day's VisitSummary), `map.checkIns[].status`, `agents[].bagCount|currentVisit`.
  - Webhooks: signature key is the full secret string (`whsec_…`, UTF-8). **1 immediate attempt + 6 retries (7 total)**: retry delays 30s, 2m, 10m, 30m, 2h, 6h; the 7th failure → `DEAD` *(changed 2026-10-21; was 6 attempts)*. Manual retry gives one more immediate attempt. `DELETE /v1/admin/webhooks/:id` deactivates (history kept; pending deliveries → DEAD). Event types may also include `'*'` (all). Deliveries list adds `endpointUrl`. `GET /v1/admin/webhooks/received` → `{id,endpointId,deliveryId,eventId,eventType,signatureOk,headers,body,receivedAt}[]`.
  - `GET /v1/admin/webhooks/deliveries/:id` → `attemptLog[]` adds `requestHeaders` `{Content-Type, User-Agent, X-JewelRoute-Event, X-JewelRoute-Delivery, X-JewelRoute-Timestamp, X-JewelRoute-Signature}` (null for attempts made before 2026-10-21).
  - Dashboard: `visits`, `agents[].currentVisit`, `agents[].bagCount` are now part of the contract (see Admin → dashboard).
  - Ops: **new** `POST /v1/internal/seed` (same CRON_SECRET guard) → idempotently wipes + recreates tenant `aurum`; returns `{tenant, ms, shops, designs, pieces, visits, orders, memos, rahulBag, rates, webhookEndpoint}`.
  - Ops: `/v1/internal/dispatch` accepts `x-cron-secret` **or** `Authorization: Bearer <CRON_SECRET>`, via POST or GET (Vercel Cron). Returns run stats.

- **2026-10-21 (api, sales-surface gaps — `docs/API_ISSUES.md` #7–#10; tests `apps/api/test/records.test.ts`)** — additive:
  - `GET /v1/admin/orders/:id`, `/v1/admin/memos/:id`, `/v1/admin/pieces/:id` add **`activity: ActivityItem[]`** (newest first, ≤100). Order = events whose aggregate is the order or whose payload `data.orderId` is it (incl. `memo.converted`). Memo = aggregate is the memo, or payload `data.memoId` / `data.sourceMemoId` (custody handovers/returns, the converted order's `order.created`). Piece = every `sample.custody_changed` in its ledger (by `CustodyEvent.outboxEventId`) plus any event whose `data.pieces[]` contains it (`memo.created`, `memo.returned`, `memo.converted`).
  - `PieceRow` (lists and `/admin/pieces/:id`, shop/agent/profile bags) adds **`location?`** for `custodianType: 'AGENT'` only: `{ kind: 'IN_VISIT'|'LAST_CHECK_IN'|'FIELD_BAG', label, shop?: Ref, visitId?, lat?, lng?, verification?, at? }`. `IN_VISIT` = the agent's open visit (any date) with its check-in coords, label `"At Royal Gems · in visit"`; else `LAST_CHECK_IN` = latest check-in, label `"With Rahul Verma · last check-in Sharma Jewellers 21 Oct, 11:42 am"` (IST); else `{kind:'FIELD_BAG', label:'In field bag'}`. Render `label`; never invent one client-side.
  - `GET /v1/admin/webhooks/deliveries` adds `?limit=` (1–200, default 50), `?cursor=` (opaque) and `?eventType=`. **Only when `limit` or `cursor` is passed** the response is `{ items: Delivery[], nextCursor?: string }` (keyset on `createdAt, id` desc; `nextCursor` absent on the last page; bad cursor or limit → `400 VALIDATION_FAILED`). Without either it is still the bare `Delivery[]` (latest 100) — unchanged for v1 clients.
  - **New** `POST /v1/admin/orders/approve` `{ orderIds: string[] /* 1–200 */ }` → `200 { results: { id, ok, number?, status?, error?: {code, message} }[] /* request order, duplicates collapsed */, approved, failed }`. Each order is approved in its own transaction exactly like `POST /admin/orders/:id/approve` (audit row `order.approve`, one `order.approved` event); a failure (`NOT_FOUND` — also other-tenant ids, `ORDER_ALREADY_DECIDED`) never rolls back the others.

- **2026-10-21 (api, lead follow-ups — LIVE on :4000)** — additive:
  - `GET /v1/admin/agents` → `AgentRow[]` = `{ id, name, email, phone?, homeArea?, active, today:{planned,completed,inProgress}, currentVisit?:{id,shopName,since} /* open visit, any date */, nextVisit?:{id,shopName,plannedTime?} /* first PLANNED today */, bag:{count,valuePaise /* today's rate */}, openMemos:{count,valuePaise /* outstanding at handover */,overdueCount}, ordersToday:{count,valuePaise /* non-rejected, IST day */}, lastCheckInAt? }` (one call, grouped queries). `GET /v1/admin/agents/:id` → `agent.lastCheckInAt?`.
  - **AuditRow everywhere** (`/admin/audit`, `/admin/visits/:id` `audit`, `/admin/orders/:id` + `/admin/memos/:id` `history`): `{ id, action, actor:{id,name}, actorName /* v1 */, summary /* e.g. "Approved ORD-2026-00036", "Updated Malhotra Diamonds: assigned agent: Rahul Verma → Arjun Singh" */, entityType, entityId, entity?:{type,id,name}, before, after, refs: Record<id,{type:'user'|'shop'|'order'|'memo'|'piece'|'visit'|'design'|'webhook', name}>, requestId?, createdAt }`. Render `summary`; use `refs` to label any id in `before`/`after`. `/admin/audit` is newest first; record histories oldest first.
  - Seed: Kavya's visit at Jain Ornaments today is a **SIMULATED** check-in (distance 0, accuracy null) → `proofState: 'SIMULATED'` + a `PROOF_SIMULATED` attention item; her Jain Ornaments visit 4 days ago is **LOW_ACCURACY** (±90 m, 61 m).
  - Manual webhook retry is now atomic (reset + claim in one statement) — the response always reflects the attempt it made.
  - `GET /v1/visits/:id` (and `/v1/admin/visits/:id`) adds `returns: { memoId, memoNumber, eventId?, at, pieces: {id, tagCode, name}[] }[]` — memo returns made **during this visit** (one entry per return action, oldest first) — and `resume.returnedCount`.
  - **Changed:** `GET /v1/field/visits?scope=recent` = **today (every status except CANCELLED) + the last 14 days**, newest day first, sequence order within a day (no need to merge `/field/today`).

- **2026-10-21 (api, audit pass — LIVE on :4000; see `docs/AUDIT.md`)** — behaviour changes the web must handle:
  - **Breaking (safe for the current web, which already sends keys):** `POST /v1/orders`, `/v1/memos`, `/v1/memos/:id/return`, `/v1/memos/:id/convert` **require** `Idempotency-Key` → else `400 IDEMPOTENCY_KEY_REQUIRED`. Check-in and proofs keep accepting calls without a key (they dedupe naturally).
  - `GET /v1/visits/:id` (and `/v1/admin/visits/:id`) adds `resume: { checkedIn, proofUploaded, canCheckIn, canSell, canComplete, nextStep: 'CHECK_IN'|'UPLOAD_PROOF'|'SELL_OR_COMPLETE'|'DONE'|'CLOSED', blockedBy?: {code:'VISIT_NOT_TODAY'} | {code:'ANOTHER_VISIT_OPEN', visitId}, pendingAcks: {memoId, number}[] }` — render the visit page from this after a refresh; never infer.
  - `GET /v1/field/today` adds `openVisit?: VisitSummary` — the agent's open visit **from any date** (a visit left open yesterday blocks all check-ins). `nextVisitId` points to it when present. Show it prominently.
  - Check-in / geofence-check: `accuracyM` is now **optional**. Missing accuracy → no slack and a pass is recorded `LOW_ACCURACY` (never `VERIFIED`); geofence-check echoes `accuracyM: null`.
  - `POST /v1/memos/:id/return` and `/convert` accept optional `visitId`; when omitted the caller's open visit at the memo's shop is used (or none). The custody events, the `memo.returned`/`memo.converted` payload (`data.visitId`) and the converted order's `visitId` carry it. Explicit visit at another shop → `409 VISIT_SHOP_MISMATCH`.
  - **New webhook/feed event `memo.converted`** `{memoId, number, status, orderId, orderNumber, visitId?, shop, agent, pieceCount, pieces[{id,tagCode}], totalPaise, outstandingCount}` (listed by `/admin/webhooks/event-types`; the seeded endpoint subscribes to it).
  - `POST /v1/admin/assignments`: `date` before today (IST) → `400 INVALID_DATE`; deactivated agent → `409 AGENT_INACTIVE`; accepts `plannedTime: "HH:MM"`.
  - Memo extend: new due date must also be ≥ today → `400 INVALID_DUE_DATE`. Memo create on a purity with no gold rate → `409 GOLD_RATE_MISSING` (was a ₹0 memo).
  - Orders: a deactivated design → `409 DESIGN_INACTIVE` (details `{designIds}`), was 404. Order creation now writes an `order.create` audit row (shows in `/admin/orders/:id` `history`).
  - Visits: PLANNED visits from past IST days are persisted as **`MISSED`** by the dispatcher sweep (≤1/min and on cron). Filter on `status=MISSED` now works for real data.
  - `GET /v1/files/:id`: agents can only open proof files of **their own** visits (others → 404); admins unchanged.
  - Webhook deliveries to a deactivated endpoint are parked `DEAD` (`lastError: "Endpoint is disabled"`) without an HTTP attempt; manual retry still works.
  - `GET /v1/admin/webhooks/deliveries?status=` invalid value → `400` (was 500). `POST /v1/admin/pieces/return-to-vault` with an unknown/foreign id → `404` (was 409).

- **2026-10-21 (api, v2 first pass — LIVE on :4000)** — every endpoint in the v2 section below is implemented (`apps/api/src/modules/records.ts`, migration `20261021000200_v2_attio_ia`). Decisions where the spec was open:
  - `VisitSummary` (everywhere) adds `plannedTime?` (`"HH:MM"` IST, CHECK-constrained). `Shop` (everywhere) adds `assignedAgentId?`. `POST/PATCH /v1/admin/shops` accept `assignedAgentId` (`null` clears; unknown / non-agent id → `404 NOT_FOUND`).
  - `ProofState` precedence: no check-in → `NOT_STARTED`; checked in/completed with 0 proofs → `MISSING`; else check-in verification `SIMULATED` → `SIMULATED`, `LOW_ACCURACY` → `LOW_ACCURACY`, else `VERIFIED`.
  - `AdminVisitRow.durationMin` = check-in → completion (open visit: check-in → now). `outcome.orderCount/orderValuePaise` exclude `REJECTED` orders (VisitSummary.orderCount still counts all); `memoCount/memoValuePaise` = memos issued on that visit (value at handover); `returnedCount` = pieces returned *during* that visit (custody `MEMO_RETURN` events stamped with the visit).
  - `CustodyEventRow`: intake rows have `from = {type:'VAULT', label:'Intake'}`; system rows have `actor = {id:'system', name:'System'}`. `eventId` = the `sample.custody_changed` outbox id (`evt_…`), identical to the webhook payload `id` and the ActivityItem `id`.
  - `AuditRow.actor` for retailer (public ack) rows = `{id:'retailer', name:'Retailer (public link)'}`.
  - `ShopStatus`: `MEMO_OVERDUE` if any OUT memo item is past due; else `ACTIVE` if a visit completed in the last 30 days, or it holds an active memo, or has open (SUBMITTED/APPROVED, 30-day) orders; else `NEW` if never visited and created < 30 days ago; else `DORMANT`. `ShopRow` keeps v1 `piecesHere` (= `samplesHereCount`). `nextVisit` = earliest PLANNED visit dated today or later. `samplesHereValuePaise` is at today's rate; `activeMemoValuePaise` is value at handover.
  - `PieceStatus`: SHOP custody → `OVERDUE` if its OUT memo's due date < today (IST), else `ON_MEMO`. `lastMovedAt` = latest custody event. `GET /v1/admin/pieces`: `agentId`/`shopId` filter the **current custodian**; `status` accepts a CSV (`ON_MEMO,OVERDUE`); v1 `custodianType` still accepted; `q` matches tag code, design name/SKU/collection.
  - `GET /v1/admin/visits`: `status` and `proof` accept CSV; with no `date`/`from`/`to` it defaults to today (v1 behaviour); rows ordered by date desc, agent, sequence. Invalid enum values → `400 VALIDATION_FAILED` (v1 returned 500).
  - `GET /v1/admin/memos?filter=returned` = `RETURNED` + `CONVERTED_TO_ORDER`. `filter=due_today` = open memos due today. `GET /v1/admin/orders?from&to` are IST business dates (inclusive) on `createdAt`; `status` accepts a CSV.
  - `GET /v1/admin/home` also returns `rates` (same as dashboard). `attention` rules: `MEMO_OVERDUE` (high) / `MEMO_DUE_TODAY` (medium) per open memo; `VISIT_MISSED` (medium) = MISSED or still PLANNED for the last 7 days (today counts after 18:00 IST); `PROOF_MISSING` (high) = completed with no proof (last 7 days) or checked in > 20 min without a photo; `PROOF_SIMULATED` (medium) = simulated check-ins on that date; `ORDER_PENDING` (medium) per SUBMITTED order; `WEBHOOK_FAILING` (high) per active endpoint with FAILED/DEAD deliveries in 24 h. Sorted high → medium, newest first, ≤100. `id` is stable (`<kind>:<entityId>`) for React keys.
  - `GET /v1/admin/search?q=`: empty `q` → all lists empty. `orders[].name`/`memos[].name` = `"<number> · <shop>"`; `pieces[].name` = design name.
  - `GET /v1/admin/shops/:id` → `visits` = last 30 days + all upcoming (newest first); `orders`/`memos` latest 50; `activity` = events whose payload references the shop (incl. custody to/from it).
  - `GET /v1/admin/visits/:id` = v1 detail + `row`, `audit` (rows for the visit and its orders/memos, oldest first), `activity` (≤100), `custody` (moves stamped with this visit, chronological).
  - `GET /v1/admin/agents/:id` → `agent` also has `homeArea?`; `memos` = open memos; `orders` = latest 30.
  - `GET /v1/admin/memos/:id` → `memo` also has `pieceCount`, `issuedAt`.
  - `GET /v1/field/visits`: `recent` = today + last 14 days (superseded wording; see the follow-ups entry above); `upcoming` = tomorrow … +7 days. Rows are full `AdminVisitRow`s (superset of `VisitSummary & {plannedTime, outcome}`).
  - `GET /v1/field/profile` → `user` = `Ref & {email, phone?, homeArea?}`; `week` = last 7 IST days incl. today, also returns `from`/`to`; `ordersValuePaise` excludes REJECTED.
  - `GET /v1/field/today` adds `user: Ref` (and every visit has `plannedTime`).

## v2 — Attio-style IA (2026-10-21, implemented; additive, v1 stays working)

Schema additions: `Shop.assignedAgentId?` (FK User), `Visit.plannedTime?` (`"HH:MM"` IST), `CustodyEvent.outboxEventId?` (the `evt_…` that announced it). Seed fills all three.

Shared row shapes:
```ts
type Ref = { id: string; name: string }
type ProofState = 'VERIFIED'|'LOW_ACCURACY'|'SIMULATED'|'MISSING'|'NOT_STARTED'   // MISSING = checked in/completed without proof
type AdminVisitRow = VisitSummary & { agent: Ref; plannedTime?: string; durationMin?: number; proofState: ProofState;
  outcome: { orderCount: number; orderValuePaise: number; memoCount: number; memoValuePaise: number; returnedCount: number } }
type CustodyEventRow = { id: string; seq: number; pieceId: string; tagCode: string; pieceName: string;
  from: { type: CustodianType; id?: string; label: string }; to: { type: CustodianType; id?: string; label: string };
  reason: string; occurredAt: string; actor: Ref;
  location?: { lat: number; lng: number; label: string; distanceM?: number; verification?: Verification }; // from the visit check-in
  visit?: { id: string; shopName: string }; proof?: { id: string; url: string }; memo?: { id: string; number: string };
  eventId?: string }
type PieceStatus = 'IN_VAULT'|'WITH_AGENT'|'ON_MEMO'|'OVERDUE'|'SOLD'|'LOST'
type PieceRow = Piece & { status: PieceStatus; memo?: { id: string; number: string; dueDate: string }; lastMovedAt: string; collection: string;
  location?: { kind: 'IN_VISIT'|'LAST_CHECK_IN'|'FIELD_BAG'; label: string; shop?: Ref; visitId?: string; lat?: number; lng?: number; verification?: 'VERIFIED'|'LOW_ACCURACY'|'SIMULATED'; at?: string } /* AGENT custody only */ }
type AttentionItem = { id: string; kind: 'MEMO_OVERDUE'|'MEMO_DUE_TODAY'|'VISIT_MISSED'|'PROOF_MISSING'|'PROOF_SIMULATED'|'ORDER_PENDING'|'WEBHOOK_FAILING';
  severity: 'high'|'medium'; title: string; subtitle: string; amountPaise?: number; at: string; entity: { type: 'memo'|'visit'|'order'|'webhook'|'shop'; id: string } }
type ShopStatus = 'ACTIVE'|'MEMO_OVERDUE'|'DORMANT'|'NEW'   // DORMANT = no visit in 30 days
type ShopRow = Shop & { assignedAgent?: Ref; lastVisitAt?: string; lastVisitAgent?: Ref; openOrdersPaise: number /* SUBMITTED+APPROVED, last 30 days */;
  activeMemoCount: number; activeMemoValuePaise: number; samplesHereCount: number; samplesHereValuePaise: number;
  nextVisit?: { id: string; date: string; plannedTime?: string; agent: Ref }; status: ShopStatus }
```

Admin:
- `GET /v1/admin/home?date=` → `{ user: Ref, date, metrics: { ordersToday:{count,valuePaise}, visits:{completed,planned,inProgress}, samplesOutside:{count,valuePaise}, overdueMemos:{count,valuePaise}, pendingApprovals:{count,valuePaise} }, map: (same as dashboard.map), attention: AttentionItem[], activity: ActivityItem[] /* latest 40 */, agents: (same as dashboard.agents) }`
- `GET /v1/admin/search?q=` → `{ shops: Ref&{area}[], pieces: Ref&{tagCode}[], orders: Ref&{number}[], memos: Ref&{number}[], agents: Ref[], designs: Ref&{sku}[] }` (≤5 each; for ⌘K)
- `GET /v1/admin/shops?q=&agentId=&status=` → `ShopRow[]` (enriched in place); `PATCH /v1/admin/shops/:id` accepts `assignedAgentId|null`.
- `GET /v1/admin/shops/:id` → `{ shop: ShopRow & { ownerName?, phone?, address, notes?, creditLimitPaise }, visits: AdminVisitRow[] /* last 30 + upcoming */, orders: Order[], memos: Memo[], pieces: PieceRow[] /* at this shop now */, activity: ActivityItem[] }`
- `GET /v1/admin/visits?date=&from=&to=&agentId=&shopId=&status=&proof=` → `AdminVisitRow[]`; `GET /v1/admin/visits/:id` → v1 visit detail + `{ row: AdminVisitRow, audit: AuditRow[], activity: ActivityItem[], custody: CustodyEventRow[] /* moves made during this visit */ }`
- `GET /v1/admin/agents/:id` → `{ agent: Ref & { email, phone?, active }, today: AdminVisitRow[], bag: PieceRow[], memos: Memo[], orders: Order[], activity: ActivityItem[] }`
- `GET /v1/admin/orders?status=&from=&to=&agentId=&shopId=` (filters additive); `GET /v1/admin/orders/:id` → `{ order, visit?: AdminVisitRow, history: AuditRow[], activity: ActivityItem[] }`; `POST /v1/admin/orders/approve` `{ orderIds }` → `{ results, approved, failed }`
- `GET /v1/admin/memos?filter=active|due_today|overdue|returned|all&shopId=&agentId=` → `(Memo & { pieceCount, issuedAt })[]`; `GET /v1/admin/memos/:id` → `{ memo, custody: CustodyEventRow[] /* every event of the memo's pieces from vault issue onward, chronological */, visit?: AdminVisitRow, history: AuditRow[], activity: ActivityItem[] }`
- `GET /v1/admin/pieces?q=&status=&agentId=&shopId=&designId=` → `PieceRow[]`; `GET /v1/admin/pieces/:id` → `{ piece: PieceRow, design: Design, events: CustodyEventRow[] /* full immutable ledger, newest last */, activity: ActivityItem[] }` (v1 `/history` stays)
- `AuditRow = { id, action, actor: Ref, entityType, entityId, before, after, createdAt }`

Field agent:
- `GET /v1/field/today` adds `user: Ref` and `visits[].plannedTime`.
- `GET /v1/field/visits?scope=recent|upcoming` → `VisitSummary & { plannedTime?, outcome }[]` (last 14 days / next 7).
- `GET /v1/field/catalog?q=&category=&collection=&purity=&minWeightMg=&maxWeightMg=` → same shape as visit catalog (browse outside a visit; ordering/memo still require an open visit).
- `GET /v1/field/profile` → `{ user, bag: PieceRow[], activeMemos: Memo[], week: { visitsCompleted, ordersValuePaise, memosOpen } }`

## Conventions
- Envelope: success `{ "ok": true, "data": ... }`; error `{ "ok": false, "error": { "code": "STRING_CODE", "message": "...", "details"?: any }, "requestId": "..." }` with a matching HTTP status.
- Money: integer **paise** as JSON numbers (fields end in `Paise`). Weight: integer **milligrams** (fields end in `Mg`). Distances in metres (`...M`). Dates ISO-8601 UTC; business dates `YYYY-MM-DD` in Asia/Kolkata.
- Auth: login sets httpOnly cookies `jr_at` (access JWT, 15 min) and `jr_rt` (refresh, 30 days, rotating). `Authorization: Bearer <jwt>` also accepted. On 401 `TOKEN_EXPIRED`, call `POST /v1/auth/refresh` once, then retry.
- Every mutating field-agent call that creates something (`check-in`, `orders`, `memos`, `memos/:id/return`, `proofs`) takes header `Idempotency-Key: <uuid>`; replays return the original response; same key + different body → `422 IDEMPOTENCY_KEY_REUSED`.
- Tenant is taken from the token. Every query is tenant-scoped server-side.
- Roles: `FIELD_AGENT`, `ADMIN`. `/v1/field/*`, `/v1/visits/*` = agent (admin may read). `/v1/admin/*` = admin.
- Request id: response header `x-request-id`.

## Shared shapes
```ts
type Purity = 'K24'|'K22'|'K18'|'K14'
type User = { id, name, email, role: 'FIELD_AGENT'|'ADMIN', phone?: string, tenant: { id, slug, name, demoMode: boolean } }
type Shop = { id, code, name, ownerName?, phone?, address, area, city, lat, lng, geofenceRadiusM, creditLimitPaise }
type VisitStatus = 'PLANNED'|'CHECKED_IN'|'ACTIVE'|'COMPLETED'|'MISSED'|'CANCELLED'
type VisitSummary = { id, sequence, plannedDate, status: VisitStatus, shop: Shop, checkInAt?, verification?: 'VERIFIED'|'LOW_ACCURACY'|'SIMULATED', checkInDistanceM?, completedAt?, activeMemoCount: number, activeMemoValuePaise: number, proofCount: number, orderCount: number }
type Proof = { id, url, contentType, sizeBytes, checksumSha256, capturedAt?, uploadedAt, captureLat?, captureLng?, checkInLat?, checkInLng?, distanceM? }
type PriceBreakdown = { purity: Purity, netWeightMg, ratePaisePerGram, goldRateId, rateEffectiveFrom, goldValuePaise, makingPaise, stonePaise, otherPaise, unitPricePaise /* pre-GST */, gstPaise /* 3% */, totalWithGstPaise }
type Design = { id, sku, name, category, collection, purity, grossWeightMg, netWeightMg, makingChargeType: 'PER_GRAM'|'PERCENT', makingChargeValue, stoneValuePaise, otherComponents: {label, valuePaise}[], imageUrls: string[], description?, price: PriceBreakdown, availablePieces?: Piece[] /* pieces in the calling agent's custody */ }
type Piece = { id, tagCode, designId, sku, name, imageUrl?, purity, grossWeightMg, netWeightMg, custodianType: 'VAULT'|'AGENT'|'SHOP'|'SOLD'|'LOST', custodian: { type, agentId?, agentName?, shopId?, shopName? }, valuePaise /* at today's rate */ }
type OrderItem = { id, designId, sku, name, purity, quantity, netWeightMg, ratePaisePerGram, goldValuePaise, makingPaise, stonePaise, otherPaise, unitPricePaise, lineTotalPaise, imageUrl? }
type Order = { id, number /* ORD-2026-00042 */, status: 'DRAFT'|'SUBMITTED'|'APPROVED'|'REJECTED', shop: {id,name,area}, agent: {id,name}, visitId?, subtotalPaise, gstPaise, totalPaise, goldRateSnapshot: {purity, goldRateId, ratePaisePerGram, effectiveFrom}[], items: OrderItem[], notes?, decidedBy?: {id,name}, decidedAt?, rejectionReason?, createdAt }
type MemoDisplayStatus = 'ACTIVE'|'DUE_SOON'|'OVERDUE'|'PARTIALLY_RETURNED'|'RETURNED'|'CONVERTED_TO_ORDER'  // DUE_SOON/OVERDUE derived from dueDate (IST): DUE_SOON = due within 2 days
type Memo = { id, number /* MEMO-2026-00017 */, status: 'ACTIVE'|'PARTIALLY_RETURNED'|'RETURNED'|'CONVERTED_TO_ORDER', displayStatus: MemoDisplayStatus, extended: boolean, shop: {id,name,area}, agent: {id,name}, visitId?, dueDate /* YYYY-MM-DD */, daysToDue: number /* negative = overdue */, notes?, totalValuePaise, outstandingValuePaise, ackStatus: 'PENDING'|'ACKNOWLEDGED', ackAt?, ackMethod?, items: { id, status: 'OUT'|'RETURNED'|'CONVERTED', valuePaise, returnedAt?, piece: Piece }[], extensions: {fromDueDate,toDueDate,reason?,createdAt}[], createdAt }
type ActivityItem = { id /* evt_... */, type /* event type */, title /* human sentence, e.g. "Rahul checked in at Sharma Jewellers" */, amountPaise?: number, actor?: {id,name}, shop?: {id,name}, entity: { type, id }, createdAt }
```

## Auth
- `POST /v1/auth/login` `{ email, password }` → `{ user: User, accessToken }` (+ cookies)
- `POST /v1/auth/refresh` → `{ accessToken }` (+ rotated cookies)
- `POST /v1/auth/logout` → `{}`
- `GET /v1/auth/me` → `User`

## Field agent
- `GET /v1/field/today?date=YYYY-MM-DD` → `{ agent: {id,name}, date, progress: { planned, completed, inProgress }, visits: VisitSummary[] /* ordered by sequence */, nextVisitId?: string, bag: { pieceCount, valuePaise }, activeMemos: { count, valuePaise, overdueCount } }`
- `GET /v1/visits/:id` → `{ visit: VisitSummary & { startedAt?, completedAt?, summary?, checkInLat?, checkInLng?, checkInAccuracyM? }, shop: Shop, proofs: Proof[], notes: {id, body, author:{id,name}, createdAt}[], orders: Order[] /* this visit */, memosCreated: Memo[] /* this visit */, shopContext: { previousOrders: Order[] /* last 5 at this shop */, activeMemos: Memo[] /* open memos at this shop */, lastVisit?: { id, completedAt, agentName } }, bag: Piece[] /* pieces in this agent's custody */ }`
- `POST /v1/visits/:id/geofence-check` `{ lat, lng, accuracyM }` → `{ inside: boolean, distanceM, radiusM, accuracyM, verification: 'VERIFIED'|'LOW_ACCURACY'|null, message }` (read-only; inside = distance ≤ radius + min(accuracy, 50))
- `POST /v1/visits/:id/check-in` `{ lat, lng, accuracyM, simulated?: boolean }` + Idempotency-Key → `{ visit: VisitSummary }`. Errors: `409 OUTSIDE_GEOFENCE` (details {distanceM, radiusM}), `409 ALREADY_CHECKED_IN`, `409 ANOTHER_VISIT_OPEN` (details {visitId}), `403 SIMULATION_NOT_ALLOWED`. `simulated:true` only when tenant.demoMode; recorded as `SIMULATED`.
- `POST /v1/uploads/proof-token` `{ visitId, contentType, sizeBytes }` → `{ mode: 'blob'|'direct', clientToken?, pathname, uploadUrl? }`. `blob`: browser uploads directly to Vercel Blob with `@vercel/blob/client` `put(pathname, file, { access:'public', token: clientToken })` (presigned-style token scoped to pathname, type and size). `direct` (local dev, no Blob token): `POST /v1/uploads/direct` multipart `file` → `{ url, objectKey }`.
- `POST /v1/visits/:id/proofs` `{ objectKey, url, contentType, sizeBytes, checksumSha256, capturedAt?, captureLat?, captureLng? }` + Idempotency-Key → `{ proof: Proof, visit: VisitSummary }` (visit becomes ACTIVE). Server never trusts EXIF; distance from check-in recorded.
- `POST /v1/visits/:id/notes` `{ body }` → `{ note }`
- `POST /v1/visits/:id/complete` `{ lat?, lng?, summary? }` → `{ visit: VisitSummary }` (requires CHECKED_IN/ACTIVE; requires ≥1 proof → else `409 PROOF_REQUIRED`)
- `GET /v1/visits/:id/catalog?q=&category=&collection=&purity=&minWeightMg=&maxWeightMg=` → `{ rates: { purity, ratePaisePerGram, goldRateId, effectiveFrom }[], facets: { categories: string[], collections: string[], purities: Purity[] }, designs: Design[] /* with availablePieces from the agent's bag */ }`
- `POST /v1/orders` `{ visitId, items: { designId, quantity }[], notes? }` + Idempotency-Key → `{ order: Order }` (status SUBMITTED; prices frozen from current rates). Needs the visit open and ≥1 proof → else `409 VISIT_NOT_OPEN` / `409 PROOF_REQUIRED_BEFORE_SALE`.
- `POST /v1/memos` `{ visitId, pieceIds: string[], dueDate: 'YYYY-MM-DD', notes? }` + Idempotency-Key → `{ memo: Memo, ack: { url /* ${APP_PUBLIC_URL}/ack/<token>, shown as QR */, expiresAt } }` — custody agent → shop in one transaction. Errors: `409 PIECE_NOT_IN_YOUR_CUSTODY` (details {pieceIds}), `409 PIECE_ALREADY_ON_MEMO`, `409 PROOF_REQUIRED_BEFORE_SALE` (no arrival photo on the visit yet).
- `POST /v1/memos/:id/return` `{ pieceIds: string[], visitId? }` + Idempotency-Key → `{ memo: Memo }` (custody shop → agent; memo PARTIALLY_RETURNED or RETURNED; on a visit without a proof → `409 PROOF_REQUIRED_BEFORE_SALE`)
- `POST /v1/memos/:id/extend` `{ dueDate, reason? }` → `{ memo }`
- `POST /v1/memos/:id/convert` `{ pieceIds, visitId? }` + Idempotency-Key → `{ memo, order }` (pieces SOLD, order created from piece designs at today's rate; on a visit without a proof → `409 PROOF_REQUIRED_BEFORE_SALE`)
- `POST /v1/memos/:id/ack/verify` `{ code }` (agent enters the 6-digit code the retailer reads out from their ack page) → `{ memo }`; 5 wrong attempts → `423 ACK_LOCKED`
- Retailer acknowledgement flow (no SMS provider): agent shows a QR of `ack.url`; the retailer scans it on their own phone, sees the exact pieces/weights/value/due date, and either taps **Confirm receipt** (ackMethod `QR_CONFIRM`) or reads the 6-digit code shown on that page to the agent, who enters it (ackMethod `OTP`). The code is derived `HMAC(APP_SECRET, memoId:token) mod 10^6` — never stored in plain text. Token stored hashed; token TTL 72h.
- Public (no auth): `GET /v1/public/memo-ack/:token` → `{ tenantName, shopName, agentName, memoNumber, dueDate, items: {tagCode, name, imageUrl, purity, netWeightMg, valuePaise}[], totalValuePaise, ackStatus, code /* 6 digits, only while PENDING */ }`; `POST /v1/public/memo-ack/:token` `{ confirm: true }` → `{ ackStatus: 'ACKNOWLEDGED', ackAt }`

## Admin
- `GET /v1/admin/dashboard?date=` → `{ date, metrics: { ordersToday: {count, valuePaise}, visits: {completed, planned, inProgress}, samplesOutside: {count, valuePaise} /* custodian SHOP */, memoValueOutsidePaise, overdueMemos: {count, valuePaise}, pendingApprovals: {count, valuePaise} }, map: { shops: {id,name,lat,lng,visitStatus?: VisitStatus, piecesHere: number}[], checkIns: {visitId, agentName, shopName, lat, lng, at, verification, distanceM}[] }, activity: ActivityItem[] /* latest 40 */, exceptions: { pendingOrders: Order[], overdueMemos: Memo[], missedVisits: VisitSummary[] /* PLANNED for past dates or after 18:00 IST today, plus MISSED */ }, agents: { id, name, visitsPlanned, visitsCompleted, currentVisit?: string /* shop name of the open CHECKED_IN/ACTIVE visit */, ordersValuePaise, bagValuePaise, bagCount: number, lastCheckInAt? }[], visits: (VisitSummary & { agent: {id,name} })[] /* every visit on that date, by agent then sequence */, rates: {purity, ratePaisePerGram, goldRateId, effectiveFrom}[] }`
- `GET /v1/admin/visits?date=&agentId=&status=` → `VisitSummary & {agent:{id,name}}[]`; `GET /v1/admin/visits/:id` → same as `GET /v1/visits/:id` plus `agent`.
- `POST /v1/admin/assignments` `{ agentId, shopId, date, sequence? }` → `{ visit }` (unique per agent+shop+date → `409 ALREADY_ASSIGNED`); `DELETE /v1/admin/assignments/:visitId` (only PLANNED)
- `GET /v1/admin/orders?status=` → `Order[]`; `POST /v1/admin/orders/:id/approve` → `{ order }`; `POST /v1/admin/orders/:id/reject` `{ reason }` → `{ order }` (only from SUBMITTED; double-approve → `409 ORDER_ALREADY_DECIDED` with `details: {status, decidedBy?, decidedAt?}` = the committed decision)
- `GET /v1/admin/memos?filter=active|overdue|all` → `Memo[]`
- `GET /v1/admin/gold-rates` → `{ current: {purity, ratePaisePerGram, goldRateId, effectiveFrom, createdBy?}[], history: same[] /* latest 60 */ }`; `POST /v1/admin/gold-rates` `{ purity, ratePaisePerGram }` → `{ rate }` (append-only)
- `GET /v1/admin/shops` → `(Shop & { activeMemoValuePaise, piecesHere, lastVisitAt? })[]`; `POST /v1/admin/shops`; `PATCH /v1/admin/shops/:id`
- `GET /v1/admin/designs` → `(Design & { pieces: Piece[] })[]`; `POST /v1/admin/designs`; `PATCH /v1/admin/designs/:id`; `POST /v1/admin/designs/:id/pieces` `{ count, grossWeightMg?, netWeightMg? }` → `{ pieces }` (intake into VAULT)
- `GET /v1/admin/pieces?custodianType=&agentId=&shopId=` → `Piece[]`; `GET /v1/admin/pieces/:id/history` → `{ piece, events: {seq, fromLabel, toLabel, reason, actorName, memoNumber?, occurredAt}[] }`
- `POST /v1/admin/pieces/issue` `{ pieceIds, agentId }` (VAULT → AGENT); `POST /v1/admin/pieces/return-to-vault` `{ pieceIds }` (AGENT → VAULT)
- `GET /v1/admin/agents` → `{ id, name, email, phone, active, today: {planned, completed}, bag: {count, valuePaise}, lastCheckInAt? }[]`; `POST /v1/admin/agents` `{ name, email, phone?, password }`; `PATCH /v1/admin/agents/:id`
- `GET /v1/admin/audit?entityType=&entityId=` → `{ id, action, actorName, entityType, entityId, before, after, createdAt }[]`

## Integrations (webhooks)
- `GET /v1/admin/webhooks/event-types` → `{ type, description, example }[]` for: `visit.checked_in, visit.completed, visit.proof_uploaded, order.created, order.approved, order.rejected, memo.created, memo.extended, memo.returned, memo.converted, memo.overdue, sample.custody_changed`
- `GET /v1/admin/webhooks` → `{ id, url, description?, events, active, secretLast4, createdAt, stats: { succeeded24h, failed24h } }[]`
- `POST /v1/admin/webhooks` `{ url, description?, events }` → `{ endpoint, secret /* whsec_..., shown once */ }`; `PATCH /v1/admin/webhooks/:id` `{ url?, events?, active? }`; `DELETE /v1/admin/webhooks/:id`; `POST /v1/admin/webhooks/:id/rotate-secret` → `{ secret }`; `GET /v1/admin/webhooks/:id/secret` → `{ secret }` (reveal, audited)
- `POST /v1/admin/webhooks/:id/test` → `{ delivery }` (sends a signed `ping` event now)
- `GET /v1/admin/webhooks/deliveries?endpointId=&status=` → `{ id, endpointId, eventId, eventType, status: 'PENDING'|'SUCCEEDED'|'FAILED'|'DEAD', attempts, lastStatusCode?, lastLatencyMs?, lastError?, nextAttemptAt?, deliveredAt?, createdAt }[]` (latest 100); `GET /v1/admin/webhooks/deliveries/:id` → plus `attemptLog[]` and `payload`; `POST /v1/admin/webhooks/deliveries/:id/retry` → `{ delivery }`
- Built-in demo receiver: `POST /v1/dev/webhook-receiver/:token` verifies the signature with the endpoint whose URL contains `:token` and stores it (bad signature → stored `signatureOk:false`, 401; unknown token or receiver disabled → 404, not stored; `fail-` token → 500, not stored). Gated by `ENABLE_DEMO_RECEIVER` (see Changelog). `GET /v1/admin/webhooks/received?endpointId=` lists what it received (proves end to end).

### Delivery format
```
POST <endpoint url>
Content-Type: application/json
User-Agent: JewelRoute-Webhooks/1.0
X-JewelRoute-Event: order.created
X-JewelRoute-Delivery: <deliveryId>
X-JewelRoute-Timestamp: <unix seconds>
X-JewelRoute-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>

{ "id": "evt_01J...", "type": "order.created", "tenantId": "aurum", "createdAt": "...", "data": { ... } }
```
Retries: **1 immediate attempt + 6 retries** (7 attempts total) with backoff 30s, 2m, 10m, 30m, 2h, 6h; after the 7th failure the delivery is `DEAD`. 2xx = success. Idempotent by `id`. Every attempt is logged with the exact `requestHeaders` sent (signature included, never the secret).

## Ops
- `GET /v1/health` → `{ status: 'ok', db: 'ok', time }`
- `POST /v1/internal/dispatch` (header `x-cron-secret`) — fans out outbox events to deliveries, sends due deliveries, marks overdue memos (emits `memo.overdue` once). Also triggered after every committed write (post-commit) and by Vercel Cron.
- Swagger UI at `/docs`, OpenAPI JSON at `/docs-json`.

## Seed (Aurum Jewels, slug `aurum`)
- Admin: `admin@aurum.test` / `Aurum@2026` (Priya Mehta, Head of Sales). Agents: `rahul@aurum.test` / `Rahul@2026` (Rahul Verma), `arjun@aurum.test` / `Arjun@2026`, `kavya@aurum.test` / `Kavya@2026`.
- Shops in Delhi with real-ish coordinates (Sharma Jewellers, Karol Bagh; Mehta Jewellers, Chandni Chowk; Royal Gems, Lajpat Nagar; Kapoor & Sons, South Extension; …) geofence 100 m.
- Gold rates 22K / 18K / 24K, with ~10 days of history. ~16 designs across Bangles, Necklaces, Rings, Earrings, Bridal with images; 2–4 sample pieces each, several issued to Rahul's bag.
- Today: Rahul assigned 4 shops (Sharma Jewellers first), one completed earlier; some historical orders/memos incl. one overdue and one due soon; one webhook endpoint pointing at the built-in receiver.
