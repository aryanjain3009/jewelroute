# Cluster: custody-memo (tier T3)

## Owned paths
- `apps/api/src/core/custody.ts`: `CustodyService.move` (the custody choke point), `nextDocNumber`
- `apps/api/src/modules/memos.ts`: create, return, extend, convert, ack verify/link, public memo-ack
- `apps/api/src/modules/admin.ts`: `pieces/issue`, `pieces/return-to-vault`, piece intake, `memos/:id/extend`
- `apps/api/src/core/views.ts`: piece and memo read models (T1, read-only)
- `apps/web/src/components/field/sale/memo-*`, `components/field/visit-drawers.tsx`, `components/field/ack-view.tsx`, `apps/web/src/app/ack/**`
- SQL: `SamplePiece_custodian_consistent`, `SamplePiece_weights`, `MemoItem_one_out_per_piece`, `CustodyEvent_append_only`, UNIQUE `CustodyEvent(pieceId,seq)`

## Invariants
- INV-1 one custodian per piece, gap-free `custodySeq` with a matching `CustodyEvent` per move (test 5)
- INV-2 a piece is OUT on at most one memo (test 4)
- INV-5 memo create, return and convert are idempotent (`idem.run`, `Memo.clientOpId` unique)
- INV-6 an agent sees and moves only their own bag and memos

## State machines
- Piece custodian: VAULT → AGENT (issue) → SHOP (memo handover) → AGENT (memo return) → VAULT (return to vault) · SHOP → SOLD (convert) · SOLD → SHOP (SALE_REJECTED: the conversion's order was rejected) · LOST exists in the enum (reason ADJUSTMENT) but no route writes it yet
- Memo: ACTIVE → PARTIALLY_RETURNED → RETURNED | CONVERTED_TO_ORDER. Display adds DUE_SOON (≤2 days) and OVERDUE from the IST due date.
- MemoItem: OUT → RETURNED | CONVERTED
- Ack: PENDING → ACKNOWLEDGED (QR confirm or 6-digit code). 72 h token TTL; the 5th wrong code → 423 ACK_LOCKED; the reissued link resets attempts. v3: emits `memo.acknowledged`; `CustodyEventRow.ack` shows it on MEMO_HANDOVER rows.
- v3 convert: MemoItems flip to CONVERTED **before** `OrdersService.createInTx`, so the credit rule sees exposure net of the sold pieces (test V3); `CustodyEventRow.order` names the order on CONVERTED_TO_SALE rows. A memo-converted order cannot be cancelled; **rejecting it un-sells**: SOLD → memo's shop (reason `SALE_REJECTED`), items CONVERTED → OUT, memo status recomputed (V10). SQL: deferred triggers `SamplePiece_sold_has_live_order`, `Order_dead_unsells_pieces` (`…0500_v3_sale_guards`; OrderItem `pieceId`/`orderId` indexes `…0700/0800`). Lock order Memo → Visit → Pieces → Shop → Order (clusters/orders-pricing.md; V13). Old orphans (SOLD, no live order): `pnpm --filter @jewelroute/api db:check-orphans` (read-only, exit 1; V14).

## Consequential (needs a failing test first plus invariant-reviewer)
Any change to `move`, its lock order, the expected-custodian check, custody reasons, memo status transitions, due-date limits (today … +90), the ack code derivation (`HMAC(APP_SECRET, memoId:token) mod 10^6`) or attempt limits, or `memo.overdue` emission (once per memo, reset on extend).

## Verification gate
`pnpm --filter @jewelroute/api test` (tests 4 and 5 plus any new numbered test) and `pnpm verify`. Then DB postconditions in the test: one OUT `MemoItem` per piece, `custodySeq` equals the max `CustodyEvent.seq`, one `sample.custody_changed` outbox row per move.
