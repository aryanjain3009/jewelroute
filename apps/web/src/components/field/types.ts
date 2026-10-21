// Response shapes for the field-agent endpoints (docs/CONTRACT.md "Field agent" + v2 additions).
import type { Memo, Order, Piece, Proof, Purity, Ref, Shop, VisitSummary, Design, Verification, VisitReturn, PieceRow } from "@/lib/types";

/** v2: visits carry the planned slot ("HH:MM", IST). */
export type FieldVisit = VisitSummary & { plannedTime?: string };

export interface TodayResponse {
  agent: Ref;
  user?: Ref;
  date: string;
  progress: { planned: number; completed: number; inProgress: number };
  visits: FieldVisit[];
  nextVisitId?: string;
  /** The agent's open visit from any date (one left open yesterday blocks every check-in). */
  openVisit?: FieldVisit;
  bag: { pieceCount: number; valuePaise: number };
  activeMemos: { count: number; valuePaise: number; overdueCount: number };
}

export type ProofState = "VERIFIED" | "LOW_ACCURACY" | "SIMULATED" | "MISSING" | "NOT_STARTED";
export interface VisitOutcome { orderCount: number; orderValuePaise: number; memoCount: number; memoValuePaise: number; returnedCount: number }
/** `GET /v1/field/visits?scope=` rows. */
export type FieldVisitRow = FieldVisit & { durationMin?: number; proofState?: ProofState; outcome?: VisitOutcome };

export interface VisitNote { id: string; body: string; author: Ref; createdAt: string }

/** Server-computed resumable state of a visit. The page renders from this, never infers. */
export interface VisitResume {
  checkedIn: boolean; proofUploaded: boolean; canCheckIn: boolean; canSell: boolean; canComplete: boolean;
  nextStep: "CHECK_IN" | "UPLOAD_PROOF" | "SELL_OR_COMPLETE" | "DONE" | "CLOSED";
  blockedBy?: { code: "VISIT_NOT_TODAY" } | { code: "ANOTHER_VISIT_OPEN"; visitId: string };
  pendingAcks: { memoId: string; number: string }[];
  returnedCount?: number;
}

export interface VisitDetail {
  resume?: VisitResume;
  visit: FieldVisit & { startedAt?: string; completedAt?: string; summary?: string; checkInLat?: number; checkInLng?: number; checkInAccuracyM?: number };
  shop: Shop;
  proofs: Proof[];
  notes: VisitNote[];
  orders: Order[];
  memosCreated: Memo[];
  /** Memo returns made during this visit, oldest first. */
  returns?: VisitReturn[];
  shopContext: { previousOrders: Order[]; activeMemos: Memo[]; lastVisit?: { id: string; completedAt: string; agentName: string } };
  bag: Piece[];
}

export interface GeofenceCheck { inside: boolean; distanceM: number; radiusM: number; accuracyM: number; verification: Exclude<Verification, "SIMULATED"> | null; message: string }

export interface CatalogRate { purity: Purity; ratePaisePerGram: number; goldRateId: string; effectiveFrom: string }
export interface CatalogResponse {
  rates: CatalogRate[];
  facets: { categories: string[]; collections: string[]; purities: Purity[] };
  designs: Design[];
}

export type { PieceRow, PieceStatus } from "@/lib/types";

export interface ProfileResponse {
  user: Ref & { email: string; phone?: string; homeArea?: string };
  bag: PieceRow[];
  activeMemos: Memo[];
  week: { from?: string; to?: string; visitsCompleted: number; ordersValuePaise: number; memosOpen: number };
}

export interface AckLink { url: string; expiresAt: string }

export interface PublicAck {
  tenantName: string; shopName: string; agentName: string; memoNumber: string; dueDate: string; expiresAt?: string;
  items: { tagCode: string; name: string; imageUrl?: string; purity: Purity; netWeightMg: number; grossWeightMg?: number; sku?: string; valuePaise: number }[];
  totalValuePaise: number; ackStatus: "PENDING" | "ACKNOWLEDGED"; ackAt?: string; code?: string;
}
