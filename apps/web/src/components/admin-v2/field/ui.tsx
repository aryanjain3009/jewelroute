"use client";
/** Shared bits for the Field surfaces: status vocab (re-exported), IST formatting,
 *  error/loading states. Builds on components/app/* (chrome, timeline) — additive only. */
import * as React from "react";
import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Btn, RecordNotFound } from "@/components/app/chrome";

/* ---------------- status vocabulary: one module (components/app/status) ---------------- */
export { VISIT_STATUS, PROOF, SHOP_STATUS, MEMO_STATUS, ORDER_STATUS, PIECE_STATUS, StatusDot, StatusChip } from "@/components/app/status";

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

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

/* ---------------- dates in API sentences ---------------- */
const ISO_DAY_TIME = /\b(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2})\b)?/g;
/** API sentences carry business dates as YYYY-MM-DD and planned slots as 24-hour "HH:MM" (IST wall clock);
 *  show them as "21 Oct" and "21 Oct, 2:30 pm". */
export const prettyDates = (t: string) => t.replace(ISO_DAY_TIME, (_, d: string, hm?: string) => `${istDay(d) ?? d}${hm ? `, ${wallTime(hm)}` : ""}`);
/** IST calendar days between two instants (later minus earlier). */
const istDayDiff = (from: Date, to: Date) => {
  const k = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  return Math.round((+new Date(`${k(to)}T00:00:00Z`) - +new Date(`${k(from)}T00:00:00Z`)) / 86400_000);
};
/** Compact age for exception rows: "12 min", "3 h", then IST calendar days ("2 days") — the same count as
 *  a memo's "2d late" or a visit planned two days ago, never a rounded 24-hour block. Future reads "in 3 h". */
export function age(iso: string, now: Date) {
  const at = new Date(iso);
  const s = Math.round((now.getTime() - at.getTime()) / 1000);
  const a = Math.abs(s);
  const days = Math.abs(s < 0 ? istDayDiff(now, at) : istDayDiff(at, now));
  const v = a < 3600 ? `${Math.max(1, Math.round(a / 60))} min` : a < 86400 || days === 0 ? `${Math.round(a / 3600)} h` : `${days} day${days === 1 ? "" : "s"}`;
  return s < 0 ? `in ${v}` : v;
}

/* ---------------- states ---------------- */
export function QueryError({ error, retry, className }: { error: unknown; retry?: () => void; className?: string }) {
  if (error instanceof ApiError && error.status === 404) return <RecordNotFound message={error.message} />;
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
