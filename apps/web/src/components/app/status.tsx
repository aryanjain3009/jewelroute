"use client";
/** The ONE status vocabulary for the authenticated app (admin): tone + label per API status.
 *  Attio renders status as an 8px dot + plain label in tables and properties; chips only where a
 *  value must stand out (record header). Field pills (`jr/status`) mirror the same labels. */
import * as React from "react";
import { formatINRCompact } from "@jewelroute/shared";
import type { ApprovalReason, CreditPosition, MemoDisplayStatus, OrderStatus, PieceStatus, ProofState, ShopStatus, VisitStatus } from "@/lib/types";
import { Chip, Dot, type Tone } from "./chrome";

export type StatusMap<K extends string> = Record<K, [Tone, string]>;

export const ORDER_STATUS: StatusMap<OrderStatus> = {
  DRAFT: ["grey", "Draft"],
  CONFIRMED: ["green", "Confirmed"],
  PENDING_APPROVAL: ["amber", "Pending approval"],
  APPROVED: ["green", "Approved"],
  REJECTED: ["red", "Rejected"],
  CANCELLED: ["grey", "Cancelled"],
  SUBMITTED: ["amber", "Submitted"],
};
/** Statuses that count towards a retailer's outstanding until settled (contract v3). */
export const ORDER_COUNTS_OUTSTANDING: OrderStatus[] = ["CONFIRMED", "APPROVED"];
export const isPendingApproval = (s: OrderStatus) => s === "PENDING_APPROVAL" || s === "SUBMITTED";

export const VISIT_STATUS: StatusMap<VisitStatus> = {
  PLANNED: ["grey", "Planned"], CHECKED_IN: ["blue", "Checked in"], ACTIVE: ["blue", "In visit"],
  COMPLETED: ["green", "Completed"], MISSED: ["red", "Missed"], CANCELLED: ["grey", "Cancelled"],
};
export const PROOF: StatusMap<ProofState> = {
  VERIFIED: ["green", "Verified"], LOW_ACCURACY: ["amber", "Low GPS accuracy"], SIMULATED: ["blue", "Simulated"],
  MISSING: ["red", "Missing"], NOT_STARTED: ["grey", "Not started"],
};
export const SHOP_STATUS: StatusMap<ShopStatus> = {
  ACTIVE: ["green", "Active"], MEMO_OVERDUE: ["red", "Memo overdue"], DORMANT: ["amber", "Dormant"], NEW: ["grey", "New"],
};
export const MEMO_STATUS: StatusMap<MemoDisplayStatus> = {
  ACTIVE: ["gold", "On memo"], DUE_SOON: ["amber", "Due soon"], OVERDUE: ["red", "Overdue"],
  PARTIALLY_RETURNED: ["blue", "Partly closed"], RETURNED: ["grey", "Returned"], CONVERTED_TO_ORDER: ["green", "Converted to order"],
};
export const PIECE_STATUS: StatusMap<PieceStatus> = {
  IN_VAULT: ["grey", "In vault"], WITH_AGENT: ["blue", "With agent"], ON_MEMO: ["gold", "On memo"], OVERDUE: ["red", "Overdue"], SOLD: ["green", "Sold"], LOST: ["red", "Lost"],
};

export function StatusDot<K extends string>({ map, value, className }: { map: StatusMap<K>; value: K; className?: string }) {
  return <Dot tone={map[value]?.[0] ?? "grey"} className={className}>{map[value]?.[1] ?? value}</Dot>;
}
export function StatusChip<K extends string>({ map, value }: { map: StatusMap<K>; value: K }) {
  return <Chip tone={map[value]?.[0] ?? "grey"}>{map[value]?.[1] ?? value}</Chip>;
}
export const OrderStatusDot = ({ status, className }: { status: OrderStatus; className?: string }) => <StatusDot map={ORDER_STATUS} value={status} className={className} />;

/* ---------- approval reasons (server decides; we only phrase them) ---------- */
export const REASON_SHORT: Record<ApprovalReason, string> = { CREDIT_LIMIT: "Over credit limit", ORDER_THRESHOLD: "At or above approval threshold" };

/** "Over credit limit by ₹2.4L" / "Above ₹10L approval threshold" — from the frozen position only. */
export function reasonText(r: ApprovalReason, p?: CreditPosition | null): string {
  if (r === "CREDIT_LIMIT") {
    if (p && p.creditLimitPaise > 0) {
      const over = p.projectedExposurePaise - p.creditLimitPaise;
      return over > 0 ? `Over credit limit by ${formatINRCompact(over)}` : "Over credit limit";
    }
    return "Over credit limit";
  }
  // The rule trips at amount ≥ threshold, so an order of exactly the threshold is "at", not "above".
  return p?.approvalThresholdPaise != null ? `At or above the ${formatINRCompact(p.approvalThresholdPaise)} approval threshold` : "At or above the approval threshold";
}
export const reasonsText = (rs: ApprovalReason[] | undefined, p?: CreditPosition | null) => (rs ?? []).map((r) => reasonText(r, p)).join(" · ");

/** One label for a simulated (demo) check-in wherever a distance, accuracy or "checked" figure would go:
 *  its coordinates were entered, not measured, so nothing about them is verified. */
export const SIMULATED_LOCATION = "Simulated location (demo) · not verified";

/** Audit B8: the retailer acknowledgement came from the agent's own session/device. Evidence only
 *  (the API blocks nothing), so it is a restrained amber line, not a pill. `note` is the API's text. */
export const SELF_ACK_COPY = "Acknowledged from the agent's device";
export function SelfAckNote({ note, className }: { note?: string; className?: string }) {
  return (
    <span className={["inline-flex items-start gap-1.5 text-[13px] leading-5 text-warn", className].filter(Boolean).join(" ")}>
      <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warn" />
      <span>{note || SELF_ACK_COPY} — confirm with the retailer</span>
    </span>
  );
}
