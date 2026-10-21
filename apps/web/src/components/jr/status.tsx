import { cn } from "@/lib/utils";
import type { DeliveryStatus, MemoDisplayStatus, OrderStatus, Verification, VisitStatus } from "@/lib/types";

type Tone = "neutral" | "ink" | "verified" | "warn" | "danger" | "gold" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 ring-line",
  ink: "bg-ink text-paper ring-ink",
  verified: "bg-verified-soft text-verified ring-verified/20",
  warn: "bg-warn-soft text-warn ring-warn/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  gold: "bg-gold-soft text-gold-ink ring-gold/25",
  info: "bg-info-soft text-info ring-info/20",
};

export function Pill({ tone = "neutral", children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const VISIT: Record<VisitStatus, [Tone, string]> = {
  PLANNED: ["neutral", "Planned"], CHECKED_IN: ["info", "Checked in"], ACTIVE: ["verified", "In visit"],
  COMPLETED: ["verified", "Completed"], MISSED: ["danger", "Missed"], CANCELLED: ["neutral", "Cancelled"],
};
export const VisitStatusPill = ({ status }: { status: VisitStatus }) => <Pill tone={VISIT[status][0]} dot>{VISIT[status][1]}</Pill>;

const MEMO: Record<MemoDisplayStatus, [Tone, string]> = {
  ACTIVE: ["gold", "On memo"], DUE_SOON: ["warn", "Due soon"], OVERDUE: ["danger", "Overdue"],
  PARTIALLY_RETURNED: ["info", "Partly closed"], RETURNED: ["neutral", "Returned"], CONVERTED_TO_ORDER: ["verified", "Converted to order"],
};
export const MemoStatusPill = ({ status }: { status: MemoDisplayStatus }) => <Pill tone={MEMO[status][0]} dot>{MEMO[status][1]}</Pill>;

const ORDER: Record<OrderStatus, [Tone, string]> = {
  DRAFT: ["neutral", "Draft"], CONFIRMED: ["verified", "Confirmed"], PENDING_APPROVAL: ["warn", "Pending approval"], APPROVED: ["verified", "Approved"],
  REJECTED: ["danger", "Rejected"], CANCELLED: ["neutral", "Cancelled"], SUBMITTED: ["warn", "Submitted"],
};
export const OrderStatusPill = ({ status }: { status: OrderStatus }) => <Pill tone={ORDER[status][0]} dot>{ORDER[status][1]}</Pill>;

const DELIVERY: Record<DeliveryStatus, [Tone, string]> = {
  PENDING: ["neutral", "Pending"], SUCCEEDED: ["verified", "Delivered"], FAILED: ["warn", "Retrying"], DEAD: ["danger", "Dead letter"],
};
export const DeliveryStatusPill = ({ status }: { status: DeliveryStatus }) => <Pill tone={DELIVERY[status][0]} dot>{DELIVERY[status][1]}</Pill>;

const VER: Record<Verification, [Tone, string]> = {
  VERIFIED: ["verified", "GPS verified"], LOW_ACCURACY: ["warn", "GPS low accuracy"], SIMULATED: ["info", "Simulated (demo)"],
};
export const VerificationPill = ({ v, distanceM }: { v: Verification; distanceM?: number }) => (
  <Pill tone={VER[v][0]}>{VER[v][1]}{distanceM !== undefined && <span className="num opacity-80">· {Math.round(distanceM)} m</span>}</Pill>
);
