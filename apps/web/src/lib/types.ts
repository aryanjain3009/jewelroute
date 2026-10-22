// Mirrors docs/CONTRACT.md "Shared shapes". Keep in sync with the contract.
export type Role = "FIELD_AGENT" | "ADMIN";
export type Purity = "K24" | "K22" | "K18" | "K14";
export type VisitStatus = "PLANNED" | "CHECKED_IN" | "ACTIVE" | "COMPLETED" | "MISSED" | "CANCELLED";
export type Verification = "VERIFIED" | "LOW_ACCURACY" | "SIMULATED";
export type MemoDisplayStatus = "ACTIVE" | "DUE_SOON" | "OVERDUE" | "PARTIALLY_RETURNED" | "RETURNED" | "CONVERTED_TO_ORDER";
/** v3: CONFIRMED is the normal case (no rule tripped); PENDING_APPROVAL only when a rule tripped.
 *  `SUBMITTED` is legacy (migrated away in v3) — kept so an old row never crashes a screen. */
export type OrderStatus = "DRAFT" | "CONFIRMED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED" | "SUBMITTED";
export type CustodianType = "VAULT" | "AGENT" | "SHOP" | "SOLD" | "LOST";
export type DeliveryStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "DEAD";

export interface Tenant { id: string; slug: string; name: string; demoMode: boolean }
export interface User { id: string; name: string; email: string; role: Role; phone?: string; tenant: Tenant }
export interface Ref { id: string; name: string }
export interface Shop { id: string; code: string; name: string; ownerName?: string; phone?: string; address: string; area: string; city: string; lat: number; lng: number; geofenceRadiusM: number; creditLimitPaise: number }
export interface VisitSummary {
  id: string; sequence: number; plannedDate: string; status: VisitStatus; shop: Shop;
  checkInAt?: string; verification?: Verification; checkInDistanceM?: number; completedAt?: string;
  activeMemoCount: number; activeMemoValuePaise: number; proofCount: number; orderCount: number;
  agent?: Ref;
}
export interface Proof { id: string; url: string; contentType: string; sizeBytes: number; checksumSha256: string; capturedAt?: string; uploadedAt: string; captureLat?: number; captureLng?: number; checkInLat?: number; checkInLng?: number; distanceM?: number }
export interface PriceBreakdown { purity: Purity; netWeightMg: number; ratePaisePerGram: number; goldRateId: string; rateEffectiveFrom: string; goldValuePaise: number; makingPaise: number; stonePaise: number; otherPaise: number; unitPricePaise: number; gstPaise: number; totalWithGstPaise: number }
export interface Custodian { type: CustodianType; agentId?: string; agentName?: string; shopId?: string; shopName?: string }
export interface Piece { id: string; tagCode: string; designId: string; sku: string; name: string; imageUrl?: string; purity: Purity; grossWeightMg: number; netWeightMg: number; custodianType: CustodianType; custodian: Custodian; valuePaise: number }
export interface Design {
  id: string; sku: string; name: string; category: string; collection: string; purity: Purity; grossWeightMg: number; netWeightMg: number;
  makingChargeType: "PER_GRAM" | "PERCENT"; makingChargeValue: number; stoneValuePaise: number; otherComponents: { label: string; valuePaise: number }[];
  imageUrls: string[]; description?: string; price: PriceBreakdown; availablePieces?: Piece[]; pieces?: Piece[];
}
export interface OrderItem { id: string; pieceId?: string; designId: string; sku: string; name: string; purity: Purity; quantity: number; netWeightMg: number; ratePaisePerGram: number; goldValuePaise: number; makingPaise: number; stonePaise: number; otherPaise: number; unitPricePaise: number; lineTotalPaise: number; imageUrl?: string }
export interface Order {
  id: string; number: string; status: OrderStatus; shop: Ref & { area?: string }; agent: Ref; visitId?: string; sourceMemoId?: string; itemCount?: number;
  subtotalPaise: number; gstPaise: number; totalPaise: number;
  goldRateSnapshot: { purity: Purity; goldRateId: string; ratePaisePerGram: number; effectiveFrom: string }[];
  items: OrderItem[]; notes?: string; decidedBy?: Ref; decidedAt?: string; rejectionReason?: string; createdAt: string;
  /** v3 — the rule evaluation frozen when the order was written (server-authoritative). */
  approval?: OrderApproval;
  settledAt?: string | null; cancelledAt?: string | null; cancellationReason?: string | null;
}
export type SelfAckReason = "AGENT_SESSION" | "AGENT_DEVICE" | "CODE_VIEWED_ON_AGENT_DEVICE";
export interface MemoItem { id: string; status: "OUT" | "RETURNED" | "CONVERTED"; valuePaise: number; returnedAt?: string; piece: Piece }
export interface Memo {
  id: string; number: string; status: "ACTIVE" | "PARTIALLY_RETURNED" | "RETURNED" | "CONVERTED_TO_ORDER"; displayStatus: MemoDisplayStatus; extended: boolean;
  shop: Ref & { area?: string }; agent: Ref; visitId?: string; dueDate: string; daysToDue: number; notes?: string;
  totalValuePaise: number; outstandingValuePaise: number; ackStatus: "PENDING" | "ACKNOWLEDGED"; ackAt?: string; ackMethod?: string;
  /** Audit B8: the acknowledgement came from the agent's own session/device (evidence only, nothing is blocked). */
  selfAckSuspected?: boolean; selfAckReason?: SelfAckReason;
  items: MemoItem[]; extensions: { fromDueDate: string; toDueDate: string; reason?: string; createdAt: string }[]; createdAt: string;
}
export type ActivityKind = "visit" | "order" | "memo" | "custody" | "proof" | "ack" | "rate" | "webhook" | "system";
/** v3 indexed refs: every record an event touches, so any surface can show it the same way. */
export interface ActivityRefs { shop?: Ref; agent?: Ref; visit?: { id: string; date: string; shopName: string }; order?: { id: string; number: string }; memo?: { id: string; number: string }; pieces?: { id: string; tagCode: string }[] }
/** v3 optional detail: photo, amounts, from→to. Render only what is present. */
export interface ActivityDetail {
  photoUrl?: string; amountPaise?: number; status?: string; reasons?: string[]; fromLabel?: string; toLabel?: string; reason?: string;
  pieceCount?: number; dueDate?: string; verification?: string; distanceM?: number; method?: string;
}
export interface ActivityItem {
  id: string; type: string; title: string; amountPaise?: number; actor?: Ref; shop?: Ref; entity: { type: string; id: string }; createdAt: string;
  kind?: ActivityKind; refs?: ActivityRefs; detail?: ActivityDetail;
}
export interface ActivityPage { items: ActivityItem[]; nextCursor?: string | null }
export interface ActivityFilter { shopId?: string; agentId?: string; visitId?: string; orderId?: string; memoId?: string; pieceId?: string }

/* ---- v3 credit (docs/CONTRACT.md § v3; arithmetic in @jewelroute/shared creditPosition) ---- */
export type ApprovalReason = "CREDIT_LIMIT" | "ORDER_THRESHOLD";
export interface CreditPosition {
  creditLimitPaise: number; openingOutstandingPaise?: number; unsettledOrdersPaise?: number;
  outstandingPaise: number; memoExposurePaise: number; exposurePaise: number;
  /** null = no credit limit configured (unlimited) — never render it as ₹0. */
  availableCreditPaise: number | null; overLimit?: boolean; approvalThresholdPaise?: number | null;
  orderAmountPaise: number; projectedExposurePaise: number; requiresApproval: boolean; reasons: ApprovalReason[];
  asOf?: string;
}
/** `GET /v1/memos/:id/convert-preview?pieceIds=&visitId=` — read-only preview of a memo-to-sale: lines at
 *  today's rate (one piece each, pre-GST), GST once on the subtotal, and the shared credit rule with the
 *  pieces already out of memo exposure (what the convert does). The convert re-checks under its locks. */
export interface ConvertPreview {
  memoId: string; memoNumber: string; visitId?: string;
  lines: { pieceId: string; tagCode: string; designId: string; sku: string; name: string; purity: Purity; imageUrl?: string; netWeightMg: number; goldRateId: string; ratePaisePerGram: number; goldValuePaise: number; makingPaise: number; stonePaise: number; otherPaise: number; unitPricePaise: number; lineTotalPaise: number; memoValuePaise: number }[];
  subtotalPaise: number; gstPaise: number; totalPaise: number;
  goldRateSnapshot: { purity: Purity; goldRateId: string; ratePaisePerGram: number; effectiveFrom: string }[];
  credit: CreditPosition;
}
/** `position` is null for orders written before v3 (no snapshot was taken). */
export interface OrderApproval { required: boolean; reasons: ApprovalReason[]; position: CreditPosition | null }
export interface TenantSettings { approvalThresholdPaise: number | null; demoMode: boolean }
export interface GoldRateRow { purity: Purity; ratePaisePerGram: number; goldRateId: string; effectiveFrom: string; createdBy?: Ref | null }

// ---- v2 (docs/CONTRACT.md "v2 — Attio-style IA"); additive ----
export type ProofState = "VERIFIED" | "LOW_ACCURACY" | "SIMULATED" | "MISSING" | "NOT_STARTED";
export interface VisitOutcome { orderCount: number; orderValuePaise: number; memoCount: number; memoValuePaise: number; returnedCount: number }
export type AdminVisitRow = VisitSummary & {
  agent: Ref; plannedTime?: string; durationMin?: number; proofState: ProofState; outcome: VisitOutcome;
  checkInLat?: number; checkInLng?: number; checkInAccuracyM?: number; startedAt?: string; summary?: string;
};
export interface CustodyParty { type: CustodianType; id?: string; label: string }
export interface CustodyEventRow {
  id: string; seq: number; pieceId: string; tagCode: string; pieceName: string;
  from: CustodyParty; to: CustodyParty; reason: string; occurredAt: string; actor: Ref;
  location?: { lat: number; lng: number; label: string; distanceM?: number; verification?: Verification };
  visit?: { id: string; shopName: string }; proof?: { id: string; url: string }; memo?: { id: string; number: string };
  eventId?: string;
  /** v3: retailer acknowledgement of a memo hand-over; `order` for conversions. */
  ack?: { status: "PENDING" | "ACKNOWLEDGED"; method?: "QR_CONFIRM" | "OTP"; at?: string; by?: "retailer"; selfAckSuspected?: true; note?: string };
  order?: { id: string; number: string };
}
export type PieceStatus = "IN_VAULT" | "WITH_AGENT" | "ON_MEMO" | "OVERDUE" | "SOLD" | "LOST";
/** Where an agent-held piece is (API-resolved; AGENT custody only). Render `label`. */
export interface PieceLocation { kind: "IN_VISIT" | "LAST_CHECK_IN" | "FIELD_BAG"; label: string; shop?: Ref; visitId?: string; lat?: number; lng?: number; verification?: Verification; at?: string }
export type PieceRow = Piece & { status: PieceStatus; memo?: { id: string; number: string; dueDate: string }; lastMovedAt: string; collection: string; location?: PieceLocation };
export type AttentionKind = "MEMO_OVERDUE" | "MEMO_DUE_TODAY" | "VISIT_MISSED" | "PROOF_MISSING" | "PROOF_SIMULATED" | "ORDER_PENDING" | "WEBHOOK_FAILING" | "ACK_SELF_SUSPECTED" | "AGENT_INACTIVE_CUSTODY";
export interface AttentionItem {
  id: string; kind: AttentionKind; severity: "high" | "medium"; title: string; subtitle: string; amountPaise?: number; at: string;
  entity: { type: "memo" | "visit" | "order" | "webhook" | "shop" | "agent"; id: string };
}
export type ShopStatus = "ACTIVE" | "MEMO_OVERDUE" | "DORMANT" | "NEW";
export type ShopRow = Shop & {
  assignedAgent?: Ref; lastVisitAt?: string; lastVisitAgent?: Ref; openOrdersPaise: number;
  activeMemoCount: number; activeMemoValuePaise: number; samplesHereCount: number; samplesHereValuePaise: number;
  nextVisit?: { id: string; date: string; plannedTime?: string; agent: Ref }; status: ShopStatus;
  /** v3 */ credit?: CreditPosition; upcomingVisit?: { id: string; date: string; plannedTime?: string; agent: Ref };
  lastOrder?: { id: string; number: string; totalPaise: number; status: OrderStatus; createdAt: string };
};
export type AuditRefType = "user" | "shop" | "order" | "memo" | "piece" | "visit" | "design" | "webhook";
/** Human audit row: render `actor.name` + `summary`; `refs` labels any id in before/after. */
export interface AuditRow {
  id: string; action: string; actor: Ref; actorName?: string; summary?: string; entityType: string; entityId: string;
  entity?: { type: AuditRefType; id: string; name: string }; before: unknown; after: unknown;
  refs?: Record<string, { type: AuditRefType; name: string }>; requestId?: string; createdAt: string;
}
export interface MapCheckIn { visitId: string; agentName: string; shopName: string; lat: number; lng: number; at: string; verification: Verification; distanceM: number; status?: VisitStatus }
export interface MapShop { id: string; name: string; area?: string; lat: number; lng: number; visitStatus?: VisitStatus; piecesHere: number }
export interface HomeAgent { id: string; name: string; visitsPlanned: number; visitsCompleted: number; currentVisit?: string; ordersValuePaise: number; bagValuePaise: number; bagCount?: number; lastCheckInAt?: string }
export interface AdminHome {
  user: Ref; date: string;
  metrics: {
    ordersToday: { count: number; valuePaise: number }; visits: { completed: number; planned: number; inProgress: number };
    samplesOutside: { count: number; valuePaise: number }; overdueMemos: { count: number; valuePaise: number }; pendingApprovals: { count: number; valuePaise: number };
  };
  map: { shops: MapShop[]; checkIns: MapCheckIn[] };
  attention: AttentionItem[]; activity: ActivityItem[]; agents: HomeAgent[];
}
export interface ShopRecord {
  shop: ShopRow & { ownerName?: string; phone?: string; address: string; notes?: string; creditLimitPaise: number };
  visits: AdminVisitRow[]; orders: Order[]; memos: Memo[]; pieces: PieceRow[]; activity: ActivityItem[];
}
export interface VisitNote { id: string; body: string; author: Ref; createdAt: string }
export interface AdminVisitRecord {
  visit: VisitSummary & { agent?: Ref; startedAt?: string; completedAt?: string; summary?: string; checkInLat?: number; checkInLng?: number; checkInAccuracyM?: number };
  shop: Shop; agent?: Ref; proofs: Proof[]; notes: VisitNote[]; orders: Order[]; memosCreated: Memo[];
  shopContext: { previousOrders: Order[]; activeMemos: Memo[]; lastVisit?: { id: string; completedAt: string; agentName: string } };
  row?: AdminVisitRow; audit?: AuditRow[]; activity?: ActivityItem[]; custody?: CustodyEventRow[]; returns?: VisitReturn[];
}
export interface AgentRecord {
  agent: Ref & { email: string; phone?: string; active: boolean; homeArea?: string; lastCheckInAt?: string };
  today: AdminVisitRow[]; bag: PieceRow[]; memos: Memo[]; orders: Order[]; activity: ActivityItem[];
}
/** v2 `GET /admin/agents` row — one call, no client-side merging. */
export interface AgentListRow {
  id: string; name: string; email: string; phone?: string; active: boolean; homeArea?: string;
  today: { planned: number; completed: number; inProgress: number };
  currentVisit?: { id: string; shopName: string; since: string }; nextVisit?: { id: string; shopName: string; plannedTime?: string };
  bag: { count: number; valuePaise: number }; openMemos: { count: number; valuePaise: number; overdueCount: number };
  ordersToday: { count: number; valuePaise: number }; lastCheckInAt?: string;
}
// v2 sales records (orders / memos / pieces)
export interface OrderRecord { order: Order; visit?: AdminVisitRow; history: AuditRow[]; activity: ActivityItem[] }
export type MemoRow = Memo & { pieceCount: number; issuedAt: string; outstandingCount?: number };
export interface MemoRecord { memo: MemoRow; custody: CustodyEventRow[]; visit?: AdminVisitRow; history: AuditRow[]; activity: ActivityItem[] }
export interface PieceRecord { piece: PieceRow; design: Design; events: CustodyEventRow[]; activity: ActivityItem[] }
/** Memo returns made during a visit (`GET /visits/:id` and `/admin/visits/:id`). */
export interface VisitReturn { memoId: string; memoNumber: string; eventId?: string; at: string; pieces: { id: string; tagCode: string; name: string }[] }
