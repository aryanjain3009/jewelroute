# API issues found while integrating the admin web app

Logged by the web (admin/landing/docs) agent. None of these block the demo; the web app works around each one.

## 1. Retry ladder: the 6-hour step is never used — RESOLVED (7 attempts; web copy updated)
- Contract (Integrations → Delivery format): "Retries: exponential backoff 30s, 2m, 10m, 30m, 2h, 6h (6 attempts), then DEAD."
- Implementation (`apps/api/src/webhooks/dispatcher.ts`): `BACKOFF_SECONDS = [30, 120, 600, 1800, 7200, 21600]`, `MAX_ATTEMPTS = 6`; after attempt 6 fails the delivery is `DEAD`, so only the first five waits are ever scheduled.
- Observed: `GET /v1/admin/webhooks/deliveries` → `{ "status": "FAILED", "attempts": 1, "lastStatusCode": 404, "nextAttemptAt": <createdAt + 30s> }`, then attempt 2 is scheduled at +2m (UI shows "attempt 2 · next in 2m").
- Web docs (`/developers#retries`) and the Integrations page describe the actual behaviour: attempts at 0, +30s, +2m, +10m, +30m, +2h, then dead letter. Either update the contract or set `MAX_ATTEMPTS = 7`.

## 2. `createdBy` on gold rates is an object, `GoldRateRow.createdBy` in `apps/web/src/lib/types.ts` is a string
- `GET /v1/admin/gold-rates` → `current[].createdBy` and `history[].createdBy` are `{ "id": "cmv…", "name": "Priya Mehta" }`.
- `src/lib/types.ts` (shared web file) declares `createdBy?: string`. Rendering it directly in JSX throws ("Objects are not valid as a React child"). The admin UI reads it through `nameOf()`; other consumers should too, or the type should become `Ref`.

## 3. Delivery detail has no request headers — RESOLVED (`attemptLog[].requestHeaders`; delivery sheet shows them)
- `GET /v1/admin/webhooks/deliveries/:id` returns `payload` and `attemptLog[] { attemptNo, statusCode, latencyMs, error, responseBody, createdAt }` but not the headers that were sent (`X-JewelRoute-Timestamp`, `X-JewelRoute-Signature`).
- The delivery sheet shows the real signed headers when the built-in receiver captured them (`GET /v1/admin/webhooks/received` → `headers`), otherwise it shows the header names with the signing formula. Adding `requestHeaders` (timestamp + signature per attempt) to the attempt log would make external-endpoint debugging exact.

## 4. `GET /v1/admin/dashboard` returns extra fields not in the contract (fine, now used)
- `visits: AdminVisit[]` and `agents[].currentVisit`, `agents[].bagCount`. The command center uses `visits` to map shop markers to today's visit; consider adding them to CONTRACT.md.

## 5. Field surfaces (web, 2026-10-21) — small v2 gaps — RESOLVED (v2 `AgentRow`, `agent.lastCheckInAt`, `AuditRow.actor/summary/refs`; the web uses them directly)
- `GET /v1/admin/agents` is still the v1 list: no `currentVisit`, `openMemos {count,valuePaise,overdueCount}`, `ordersTodayPaise`. The Agents page composes them from `/admin/dashboard`, `/admin/memos?filter=active` and `/admin/visits` (4 requests every 15 s). An enriched `AgentRow` would make it one call.
- `GET /v1/admin/agents/:id` has no `lastCheckInAt`; the record falls back to today's visits, then the newest `visit.checked_in` in `activity`.
- `AuditRow.after` carries raw ids (`shopId`, `visitId`) and enum values; the Audit tab hides cuid-looking values. Refs (`{id,name}`) instead of bare ids would read better.

# Field app (logged by the field web agent, 2026-10-21)

## 5. `GET /v1/visits/:id` has no record of samples returned during the visit — RESOLVED (`returns[]`, `resume.returnedCount`)
- The visit carries `orders` and `memosCreated`, but a `POST /memos/:id/return` made while checked in at the shop is not attached to the visit, so the field timeline ("This visit") cannot show "2 pieces returned" and the admin visit record can only infer it from `custody` moves. Suggest `returns: { memoId, memoNumber, pieceIds, tagCodes, at }[]` (or `custody: CustodyEventRow[]` as on the admin visit).

## 6. `GET /v1/field/visits?scope=recent` omits today's still-planned / open visits — RESOLVED (recent includes today; the web no longer merges)
- By contract: recent = past 14 days + today's COMPLETED/MISSED. The Visits tab therefore merges today's full route from `GET /v1/field/today` on top. Works; noting it so both stay in step (an `includeToday=1` flag would remove the merge).

# Sales surfaces — orders, memos, samples, catalog, integrations (sales web agent, 2026-10-21)

## 7. Order / memo / piece records have no per-record activity — RESOLVED (`activity` on all three records)
- `GET /v1/admin/shops/:id` and `/admin/visits/:id` return `activity`, but `/admin/orders/:id`, `/admin/memos/:id` and `/admin/pieces/:id` do not. The Activity tabs filter the workspace feed (`GET /v1/admin/activity`, latest 100) by `entity.id` / custody `eventId`, so older events silently drop off. Suggest `activity: ActivityItem[]` on all three records (outbox rows whose payload references the id).

## 8. A piece with an agent has no location — RESOLVED (`PieceRow.location` for AGENT custody)
- `PieceRow` says who holds a piece but not where: for `WITH_AGENT` the Samples list and sample record compose "At Royal Gems · in visit" from today's `GET /v1/admin/visits` (the agent's CHECKED_IN/ACTIVE visit). A `location?: { shopId, shopName, visitId }` on `PieceRow` for agents in an open visit would make it one call and work for past dates.

## 9. Deliveries list is capped at 100, no paging or date filter — RESOLVED (`?limit=&cursor=&eventType=` → `{items,nextCursor}`; bare array kept without them)
- `GET /v1/admin/webhooks/deliveries` returns the latest 100 across endpoints. Fine for the demo; a busy tenant needs `before=` cursor paging and `eventType=` filtering for the delivery log.

## 10. Bulk order approval is N requests — RESOLVED (`POST /v1/admin/orders/approve` with per-order results)
- The Orders list approves selected orders with one `POST /admin/orders/:id/approve` each (`Promise.allSettled`, per-order errors reported). A `POST /admin/orders/approve { orderIds }` returning per-id results would make it atomic per request and cheaper.
