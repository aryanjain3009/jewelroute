# JewelRoute system design (one page, 22 Oct 2026)

## Tenants and roles
- **Tenant** = one business workspace (`Tenant`: slug, name, `demoMode`, approval threshold). Every business row carries `tenantId`; every lookup index leads with it.
- The tenant comes **only** from the signed access JWT (`tid`). Ids from another tenant, or another agent's own records, answer `404` (no existence leak).
- Today's roles: `ADMIN` and `FIELD_AGENT`. Permissions are a map (`common/auth.ts` `ROLE_PERMISSIONS`); routes declare permissions, not roles.

| Role | Who | Permissions | Can |
|---|---|---|---|
| Owner | The person who signs the workspace up | `ADMIN` + is the tenant's first user | everything an admin can; cannot be deactivated by another admin (planned) |
| Admin / manager | Office staff | `admin`, `admin.read`, `field` (read) | gold rate, designs, pieces, shops, agents, routes, approvals, webhooks, settings |
| Agent | Field salesperson | `field` | own route, own visits, own bag, own memos and orders only |
| Retailer | Shop owner, no account | public token | sees and confirms only the pieces on one memo (`/ack/:token`, 72 h, 6-digit code) |

A separate read-only `MANAGER` role is not built. Adding it is one enum value plus one `ROLE_PERMISSIONS` row.

## Data model (core)
`Tenant 1─* User` (agents, admins) · `Shop` (geofence, credit limit, opening balance, assigned agent) · `JewelryDesign 1─* SamplePiece` (tag code, weights in mg) · `GoldRate` (append-only per purity) · `Visit 1─* VisitProof/VisitNote` · `Order 1─* OrderItem` (frozen prices) · `Memo 1─* MemoItem` · `CustodyEvent` (append-only ledger) · `OutboxEvent 1─* WebhookDelivery 1─* WebhookAttempt` · `AuditLog` · `IdempotencyKey`.
Money is integer paise (BIGINT); weight is integer mg; business dates are IST.

## Lifecycles
- **Visit:** `PLANNED → CHECKED_IN → ACTIVE → COMPLETED`; `PLANNED → MISSED` (sweep after the day) or `CANCELLED`. One open visit per agent (partial unique). Check-in only inside the fence (server recomputes distance), on the planned IST date.
- **Order:** created as `CONFIRMED` or `PENDING_APPROVAL` by the credit rule. `PENDING_APPROVAL → APPROVED | REJECTED`; `CONFIRMED/PENDING → CANCELLED`; `CONFIRMED/APPROVED → settled` (a timestamp). Rejecting a memo-converted order un-sells its pieces.
- **Memo:** `ACTIVE → PARTIALLY_RETURNED → RETURNED | CONVERTED_TO_ORDER`; each item `OUT → RETURNED | CONVERTED` (and back to `OUT` on a rejected sale). Acknowledgement `PENDING → ACKNOWLEDGED`.
- **Piece custody:** `VAULT ⇄ AGENT ⇄ SHOP → SOLD` (and `SOLD → SHOP` on a rejected sale). Every move goes through `CustodyService.move`: lock rows, check the expected holder, `custodySeq + 1`, append a `CustodyEvent`, one outbox event, one audit row.
- **Webhook delivery:** `PENDING → SUCCEEDED`, or `FAILED` (retry at 30 s, 2 m, 10 m, 30 m, 2 h, 6 h) → `DEAD` after the 7th attempt. Manual retry adds one attempt. Claims use `FOR UPDATE SKIP LOCKED` with a 30 s lease.

## Concurrency
- **Lock order** for any write that takes several row locks: **Memo → Visit → SamplePiece (by id) → Shop → Order.** One order everywhere means no deadlock cycle.
- Uniqueness lives in SQL, not in a "check then insert": one open visit per agent, one `OUT` memo item per piece, `(tenantId, key)` idempotency, unique `clientOpId` on orders and memos, unique `(pieceId, seq)` on custody events.
- Credit: every write that changes a shop's exposure (order create, memo convert, approve, settle, cancel, shop PATCH) locks the shop row, so two bookings cannot both pass the limit.
- Refresh-token rotation, logout and deactivation serialise on a per-user advisory lock.

## Idempotency and the outbox
- Every create takes an `Idempotency-Key`. The key row is inserted **inside** the business transaction; a duplicate waits on the unique slot, then replays the stored response. Same key with another body → `422`. An error rolls the key back, so a retry runs again.
- The outbox row is written in the same transaction as the change, so an event exists if and only if the change committed. Delivery is at-least-once with an HMAC-SHA256 signature; receivers dedupe on the event id.
- The activity feed is a projection of the outbox (`ActivityService`), so the feed and the webhooks cannot disagree.

## Cache invalidation (web)
- All server state is in TanStack Query with keys from `qk` (`apps/web/src/lib/sync.ts`).
- After a write, the screen calls `useSync()(change)`. The `AFFECTS` map names every query that can show that fact. For example, `memo.created` refreshes the memo, sample, shop, visit, the agent's bag, Home and Activity.
- Other users' changes arrive through polling on live screens (Home 10 s, deliveries 5 s) and a refetch when the window regains focus.

## Gaps found (ranked in BACKLOG.md)
1. **No self-serve signup.** A business cannot create a workspace; tenants exist only through the seed.
2. **No onboarding.** A new owner sees an empty dashboard with no guidance.
3. **Deactivating an agent** revokes sessions but leaves planned visits and the bag unflagged.
4. **Login is ambiguous across tenants** when one email exists in two workspaces (`take: 2` → refuse). Signup must keep emails unique.
5. Concurrency proofs exist for several races (reject ‖ convert, idempotent duplicates). There is no ×20 suite asserting ledger contiguity and exactly-once outbox.
