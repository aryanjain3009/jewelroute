"use client";
/** Shared bits for the Field surfaces: status vocab, IST formatting, activity → timeline mapping,
 *  error/loading states. Builds on components/app/* (chrome, timeline) — additive only. */
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangleIcon, BellRingIcon, CameraIcon, CheckCircle2Icon, CheckIcon, ClockIcon, GemIcon, MapPinCheckIcon, ReceiptTextIcon,
  RotateCcwIcon, ScrollTextIcon, TimerIcon, WebhookIcon, XCircleIcon,
} from "lucide-react";
import { formatINRCompact } from "@jewelroute/shared";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/sync";
import { cn } from "@/lib/utils";
import type { ActivityItem, MemoDisplayStatus, OrderStatus, ProofState, Proof, ShopStatus, VisitStatus, PieceStatus } from "@/lib/types";
import { Btn, Chip, Dot, type Tone } from "@/components/app/chrome";
import { IconBubble, type TimelineItem } from "@/components/app/timeline";

/* ---------------- status vocabulary (restrained: dot + label) ---------------- */
export const VISIT_STATUS: Record<VisitStatus, [Tone, string]> = {
  PLANNED: ["grey", "Planned"], CHECKED_IN: ["blue", "Checked in"], ACTIVE: ["blue", "In visit"],
  COMPLETED: ["green", "Completed"], MISSED: ["red", "Missed"], CANCELLED: ["grey", "Cancelled"],
};
export const PROOF: Record<ProofState, [Tone, string]> = {
  VERIFIED: ["green", "Verified"], LOW_ACCURACY: ["amber", "Low GPS accuracy"], SIMULATED: ["blue", "Simulated"],
  MISSING: ["red", "Missing"], NOT_STARTED: ["grey", "Not started"],
};
export const SHOP_STATUS: Record<ShopStatus, [Tone, string]> = {
  ACTIVE: ["green", "Active"], MEMO_OVERDUE: ["red", "Memo overdue"], DORMANT: ["amber", "Dormant"], NEW: ["grey", "New"],
};
export const MEMO_STATUS: Record<MemoDisplayStatus, [Tone, string]> = {
  ACTIVE: ["gold", "On memo"], DUE_SOON: ["amber", "Due soon"], OVERDUE: ["red", "Overdue"],
  PARTIALLY_RETURNED: ["blue", "Partly returned"], RETURNED: ["grey", "Returned"], CONVERTED_TO_ORDER: ["green", "Converted"],
};
export const ORDER_STATUS: Record<OrderStatus, [Tone, string]> = {
  DRAFT: ["grey", "Draft"], SUBMITTED: ["amber", "Awaiting approval"], APPROVED: ["green", "Approved"], REJECTED: ["red", "Rejected"],
};
export const PIECE_STATUS: Record<PieceStatus, [Tone, string]> = {
  IN_VAULT: ["grey", "In vault"], WITH_AGENT: ["blue", "With agent"], ON_MEMO: ["gold", "On memo"], OVERDUE: ["red", "Overdue"], SOLD: ["green", "Sold"], LOST: ["red", "Lost"],
};
export const StatusDot = <K extends string>({ map, value, className }: { map: Record<K, [Tone, string]>; value: K; className?: string }) =>
  <Dot tone={map[value]?.[0] ?? "grey"} className={className}>{map[value]?.[1] ?? value}</Dot>;
export const StatusChip = <K extends string>({ map, value }: { map: Record<K, [Tone, string]>; value: K }) =>
  <Chip tone={map[value]?.[0] ?? "grey"}>{map[value]?.[1] ?? value}</Chip>;

/* ---------------- IST formatting ---------------- */
const TZ = "Asia/Kolkata";
const tf = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const df = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short" });
export function istTime(iso?: string | null) {
  if (!iso) return undefined;
  const p = Object.fromEntries(tf.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute} ${String(p.dayPeriod ?? "").toLowerCase().replace(/\./g, "")}`.trim();
}
/** ISO timestamp or YYYY-MM-DD business date → "21 Oct". */
export function istDay(v?: string | null) {
  if (!v) return undefined;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00+05:30`) : new Date(v);
  const p = Object.fromEntries(df.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month}`;
}
export const istDayTime = (iso?: string | null) => (iso ? `${istDay(iso)}, ${istTime(iso)}` : undefined);
/** "10:30" (IST wall clock from the API) → "10:30 am". */
export function wallTime(hhmm?: string) {
  if (!hhmm) return undefined;
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
export const fmtDist = (m?: number | null) => (m == null ? undefined : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
export const fmtCoord = (lat?: number | null, lng?: number | null) => (lat == null || lng == null ? undefined : `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
export const fmtDuration = (min?: number | null) => (min == null ? undefined : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);
/** Days since an ISO instant, in IST calendar days. */
export function daysAgo(iso?: string | null) {
  if (!iso) return undefined;
  const k = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  return Math.round((+new Date(`${k(new Date())}T00:00:00Z`) - +new Date(`${k(new Date(iso))}T00:00:00Z`)) / 86400_000);
}
export function relDay(iso?: string | null) {
  const n = daysAgo(iso);
  if (n === undefined) return undefined;
  if (n === 0) return `Today, ${istTime(iso)}`;
  if (n === 1) return `Yesterday, ${istTime(iso)}`;
  if (n < 7) return `${n} days ago`;
  return istDay(iso);
}
/** Proof/media URLs come back API-relative in local "direct" mode. */
export const mediaUrl = (u?: string | null) => (!u ? undefined : u.startsWith("/v1/") ? `/api${u}` : u);

/* ---------------- record links ---------------- */
export function entityHref(e: { type: string; id: string }): string | undefined {
  switch (e.type.toLowerCase()) {
    case "visit": return `/admin/visits/${e.id}`;
    case "order": return `/admin/orders/${e.id}`;
    case "memo": return `/admin/memos/${e.id}`;
    case "shop": return `/admin/shops/${e.id}`;
    case "samplepiece": case "piece": return `/admin/samples/${e.id}`;
    case "webhook": return "/admin/integrations";
    case "user": case "agent": return `/admin/agents/${e.id}`;
    default: return undefined;
  }
}

/* ---------------- activity → Attio timeline ---------------- */
type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;
const EVT: Record<string, [Icon, "grey" | "green" | "amber" | "red" | "blue" | "gold"]> = {
  "visit.checked_in": [MapPinCheckIcon, "blue"], "visit.proof_uploaded": [CameraIcon, "blue"], "visit.completed": [CheckCircle2Icon, "green"],
  "order.created": [ReceiptTextIcon, "grey"], "order.approved": [CheckIcon, "green"], "order.rejected": [XCircleIcon, "red"],
  "memo.created": [ScrollTextIcon, "gold"], "memo.extended": [TimerIcon, "amber"], "memo.returned": [RotateCcwIcon, "grey"], "memo.overdue": [BellRingIcon, "red"], "memo.converted": [ReceiptTextIcon, "green"], "memo.acknowledged": [CheckIcon, "green"],
  "sample.custody_changed": [GemIcon, "gold"], ping: [WebhookIcon, "grey"],
};
const ISO_DAY = /\b(\d{4}-\d{2}-\d{2})\b/g;
/** API sentences carry business dates as YYYY-MM-DD; show them as "21 Oct". */
export const prettyDates = (t: string) => t.replace(ISO_DAY, (_, d: string) => istDay(d) ?? d);
/** Compact age for exception rows: "12 min", "3 h", "2 days". Future instants read "in 3 h". */
export function age(iso: string, now: Date) {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  const a = Math.abs(s);
  const v = a < 3600 ? `${Math.max(1, Math.round(a / 60))} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} day${Math.round(a / 86400) === 1 ? "" : "s"}`;
  return s < 0 ? `in ${v}` : v;
}
/** Turn the API's sentence into "**Actor** verb **Object**" without inventing words. */
export function activitySentence(a: ActivityItem): React.ReactNode {
  let t = a.title.replace(/\s·\s₹[\d.,]+[LCr]*\s*$/u, "").replace(ISO_DAY, (_, d: string) => istDay(d) ?? d);
  const marks = [a.actor?.name, a.shop?.name, ...(t.match(/\b(ORD|MEMO)-\d{4}-\d{5}\b/g) ?? [])].filter(Boolean) as string[];
  if (!marks.length) return t;
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (t.length) {
    let best = -1, word = "";
    for (const m of marks) { const at = t.indexOf(m); if (at !== -1 && (best === -1 || at < best)) { best = at; word = m; } }
    if (best === -1) { parts.push(t); break; }
    if (best > 0) parts.push(t.slice(0, best));
    parts.push(<b key={i++}>{word}</b>);
    t = t.slice(best + word.length);
  }
  return parts;
}
export function toTimeline(items: ActivityItem[], go: (href: string) => void, opts: { proofs?: boolean } = {}): TimelineItem[] {
  return items.map((a) => {
    const [I, tone] = EVT[a.type] ?? [ClockIcon, "grey" as const];
    const href = entityHref(a.entity);
    const money = a.type.startsWith("memo.") || a.type.startsWith("sample.");
    return {
      id: a.id,
      at: a.createdAt,
      lead: <IconBubble icon={I} tone={tone} />,
      text: activitySentence(a),
      right: a.amountPaise ? <span className={cn("num font-medium", money ? "text-gold-ink" : "text-ink")}>{formatINRCompact(a.amountPaise)}</span> : undefined,
      body: opts.proofs && a.type === "visit.proof_uploaded" ? <ProofPreview visitId={a.entity.id} /> : undefined,
      onClick: href ? () => go(href) : undefined,
    };
  });
}

/** Nested card for "uploaded visit proof": the actual photo, its capture time and GPS check. */
function ProofPreview({ visitId }: { visitId: string }) {
  const q = useQuery({
    queryKey: qk.adminVisit(visitId),
    queryFn: () => api<{ proofs: Proof[]; visit: { verification?: string } }>(`/admin/visits/${visitId}`),
    staleTime: 60_000,
  });
  const p = q.data?.proofs?.[0];
  if (!p) return <div className="h-14 animate-pulse rounded-md bg-hover" />;
  return (
    <Link href={`/admin/visits/${visitId}`} className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(p.url)} alt="Visit proof" className="size-14 shrink-0 rounded-md border border-line object-cover" />
      <div className="min-w-0 text-[13px]">
        <div className="font-medium text-ink">Arrival photo</div>
        <div className="text-ink-3">Captured {istTime(p.capturedAt ?? p.uploadedAt)}{p.distanceM != null && <> · {fmtDist(p.distanceM)} from check-in</>}</div>
        {q.data?.visit.verification === "SIMULATED" && <div className="text-info">Check-in location simulated (demo)</div>}
      </div>
    </Link>
  );
}

/* ---------------- states ---------------- */
export function QueryError({ error, retry, className }: { error: unknown; retry?: () => void; className?: string }) {
  const msg = error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Couldn't load this.";
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-14 text-center", className)}>
      <AlertTriangleIcon className="size-5 text-danger" strokeWidth={1.75} />
      <p className="text-[14px] font-medium text-ink">Couldn&apos;t load this</p>
      <p className="max-w-sm text-[13px] text-ink-2">{msg}</p>
      {retry && <Btn size="sm" onClick={retry} className="mt-1">Try again</Btn>}
    </div>
  );
}
export function Bar({ className }: { className?: string }) {
  return <span className={cn("block h-3 animate-pulse rounded bg-hover", className)} />;
}
export function RecordSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row" aria-busy>
      <div className="shrink-0 space-y-4 border-b border-line p-5 lg:w-[400px] lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3"><span className="size-10 rounded-lg bg-hover" /><Bar className="w-40" /></div>
        <span className="block h-8 rounded-lg bg-hover" />
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="flex gap-6"><Bar className="w-28" /><Bar className="w-36" /></div>)}
      </div>
      <div className="flex-1 space-y-4 p-6">
        <Bar className="w-64" />
        <div className="grid grid-cols-3 gap-2.5">{Array.from({ length: 6 }).map((_, i) => <span key={i} className="h-[84px] rounded-[10px] bg-hover" />)}</div>
        <span className="block h-40 rounded-[10px] bg-hover" />
      </div>
    </div>
  );
}
/** "No value" style inline placeholder for unknown facts. */
export const NoValue = ({ children = "No value" }: { children?: React.ReactNode }) => <span className="text-ink-3">{children}</span>;

/** An anchor that looks like chrome's default Btn (32px, hairline, 8px radius) — avoids <a><button>. */
export function LinkBtn({ href, icon: I, children, external, className, label }: { href: string; icon?: Icon; children?: React.ReactNode; external?: boolean; className?: string; label?: string }) {
  const cls = cn(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-white px-3 text-[14px] font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:bg-hover",
    !children && "w-8 px-0", className,
  );
  const inner = <>{I && <I className="size-4 shrink-0" strokeWidth={1.75} />}{children}</>;
  return external ? <a href={href} target="_blank" rel="noreferrer" className={cls} aria-label={label}>{inner}</a> : <Link href={href} className={cls} aria-label={label}>{inner}</Link>;
}
