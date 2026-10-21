"use client";
/** Small shared pieces for the Sales pages (orders, memos, samples, catalog). Attio chrome; gold only for value. */
import * as React from "react";
import Link from "next/link";
import { AlertCircleIcon, CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn, Dot, type Tone } from "@/components/app/chrome";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { MemoDisplayStatus, PieceStatus } from "@/lib/types";
import { MEMO_STATUS, PIECE_STATUS, StatusDot } from "@/components/app/status";
import { errMessage } from "./data";

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

/* ---------- time (IST) ---------- */
const TZ = "Asia/Kolkata";
const parts = (d: Date, o: Intl.DateTimeFormatOptions) => Object.fromEntries(new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...o }).formatToParts(d).map((x) => [x.type, x.value]));
const asDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00+05:30`) : new Date(v));
export const fmtDay = (v?: string | null) => { if (!v) return "—"; const p = parts(asDate(v), { day: "numeric", month: "short" }); return `${p.day} ${p.month}`; };
export const fmtDayYear = (v?: string | null) => { if (!v) return "—"; const p = parts(asDate(v), { day: "numeric", month: "short", year: "numeric" }); return `${p.day} ${p.month} ${p.year}`; };
export const fmtTime = (v?: string | null) => { if (!v) return "—"; const p = parts(new Date(v), { hour: "numeric", minute: "2-digit", hour12: true }); return `${p.hour}:${p.minute} ${String(p.dayPeriod ?? "").toLowerCase().replace(/\./g, "")}`; };
export const fmtDayTime = (v?: string | null) => (v ? `${fmtDay(v)}, ${fmtTime(v)}` : "—");
export const fmtDist = (m?: number | null) => (m == null ? undefined : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
export const fmtCoord = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

/* ---------- status vocabularies: one module (components/app/status) ---------- */
export { ORDER_STATUS, MEMO_STATUS, PIECE_STATUS, OrderStatusDot } from "@/components/app/status";
export const MemoStatusDot = ({ status }: { status: MemoDisplayStatus }) => <StatusDot map={MEMO_STATUS} value={status} />;
export const PieceStatusDot = ({ status }: { status: PieceStatus }) => <StatusDot map={PIECE_STATUS} value={status} />;

/** "3 days overdue" / "Due today" / "in 4 days" — quiet text, red only when overdue. */
export function DueText({ days, open = true, className }: { days: number; open?: boolean; className?: string }) {
  if (!open) return null;
  const t = days < 0 ? `${-days} day${days === -1 ? "" : "s"} overdue` : days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `in ${days} days`;
  return <span className={cn("text-[13px]", days < 0 ? "text-danger" : days <= 1 ? "text-warn" : "text-ink-3", className)}>{t}</span>;
}


/* ---------- visuals ---------- */
export function Thumb({ src, alt, size = 20, className }: { src?: string | null; alt: string; size?: number; className?: string }) {
  return (
    <span className={cn("block shrink-0 overflow-hidden rounded-[5px] bg-sunken ring-1 ring-black/5", className)} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" /> : null}
    </span>
  );
}
/** 40px coloured object square used as a record header lead. */
export function ObjectLead({ icon: I, tint, size = 40 }: { icon: Icon; tint: string; size?: number }) {
  return <span className={cn("grid shrink-0 place-items-center rounded-[10px] text-white", tint)} style={{ width: size, height: size }}><I className="size-5" strokeWidth={1.9} /></span>;
}

/** Neutral 20px record icon for rows whose object has no photo/avatar (orders, memos). */
export function RowIcon({ icon: I }: { icon: Icon }) {
  return <span className="grid size-5 shrink-0 place-items-center rounded-[5px] border border-line-strong bg-white text-ink-2"><I className="size-3" strokeWidth={2} /></span>;
}

/** Inline record link with Attio's dotted underline. */
export function RecLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={cn("truncate text-ink decoration-ink-3 decoration-dotted underline-offset-4 hover:underline", className)}>{children}</Link>;
}

/** A small copyable id (evt_…, ids): proportional UI font, middle-truncated, copy on click. */
export function CopyId({ id, className, label }: { id: string; className?: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  const short = id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id;
  return (
    <button
      type="button"
      title={`Copy ${id}`}
      onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(id); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* blocked */ } }}
      className={cn("inline-flex h-[22px] items-center gap-1 rounded-[6px] border border-line px-1.5 text-[12px] text-ink-2 transition-colors hover:border-line-strong hover:bg-hover hover:text-ink", className)}
    >
      {label && <span className="text-ink-3">{label}</span>}
      <span className="num">{short}</span>
      {done ? <CheckIcon className="size-3 text-verified" /> : <CopyIcon className="size-3 text-ink-3" />}
    </button>
  );
}

/** Error state with the API's own message and a retry. */
export function ErrorState({ error, retry, className }: { error: unknown; retry?: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center", className)}>
      <AlertCircleIcon className="mb-1 size-5 text-danger" strokeWidth={1.75} />
      <p className="text-[14px] font-medium text-ink">Couldn&apos;t load this</p>
      <p className="max-w-sm text-[13px] text-ink-2">{errMessage(error)}</p>
      {retry && <div className="mt-2"><Btn onClick={retry}>Try again</Btn></div>}
    </div>
  );
}

/** Skeleton for record pages: left panel + main column. */
export function RecordSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row" aria-busy>
      <div className="space-y-4 border-b border-line p-5 lg:w-[400px] lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3"><span className="size-10 animate-pulse rounded-[10px] bg-hover" /><span className="h-4 w-40 animate-pulse rounded bg-hover" /></div>
        <span className="block h-8 w-full animate-pulse rounded-lg bg-hover" />
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="flex gap-6"><span className="h-3.5 w-24 animate-pulse rounded bg-hover" /><span className="h-3.5 w-40 animate-pulse rounded bg-hover" /></div>)}
      </div>
      <div className="flex-1 space-y-4 p-6">
        <span className="block h-8 w-72 animate-pulse rounded-lg bg-hover" />
        <div className="grid grid-cols-3 gap-2.5">{Array.from({ length: 3 }).map((_, i) => <span key={i} className="h-[84px] animate-pulse rounded-[10px] bg-hover" />)}</div>
        <span className="block h-48 animate-pulse rounded-[10px] bg-hover" />
      </div>
    </div>
  );
}

/** Bordered table used inside record pages (line items, pieces). Hairline grid, 40px rows, 36px header. */
export function MiniTable({ head, children, foot, minWidth }: { head: { label: React.ReactNode; align?: "right"; icon?: Icon; className?: string; width?: number }[]; children: React.ReactNode; foot?: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line">
      <table className={cn("w-full border-separate border-spacing-0 text-[14px]", head.some((h) => h.width) && "table-fixed")} style={{ minWidth }}>
        {head.some((h) => h.width) && <colgroup>{head.map((h, i) => <col key={i} style={{ width: h.width }} />)}</colgroup>}
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={cn("h-9 whitespace-nowrap border-b border-r border-line bg-white px-3 text-left text-[13px] font-medium text-ink last:border-r-0", h.align === "right" && "text-right", h.className)}>
                <span className={cn("inline-flex items-center gap-1.5", h.align === "right" && "justify-end")}>{h.icon && <h.icon className="size-3.5 text-ink-3" strokeWidth={1.75} />}{h.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">{children}</tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
    </div>
  );
}
export function MTd({ children, align, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "right" }) {
  return <td {...rest} className={cn("h-10 whitespace-nowrap border-b border-r border-line px-3 align-middle last:border-r-0", align === "right" && "text-right", className)}>{children}</td>;
}

/** Attio modal: 480–560px, radius 12, 20px padding, 15px/600 title, footer row with hairline. */
export function Modal({ open, onOpenChange, title, description, children, footer, width = 480 }: { open: boolean; onOpenChange: (o: boolean) => void; title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-xl p-0" style={{ maxWidth: `min(${width}px, calc(100% - 2rem))` }}>
        <div className="px-5 pb-4 pt-5">
          <DialogTitle className="pr-8 text-[15px] font-semibold leading-snug text-ink">{title}</DialogTitle>
          {description ? <DialogDescription className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{description}</DialogDescription> : <DialogDescription className="sr-only">{String(title)}</DialogDescription>}
          {children && <div className="mt-4">{children}</div>}
        </div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}

/** Compact stat used in view bars: "Vault  12 · ₹1.2Cr". */
export function ViewStat({ label, count, value, tone, onClick, active }: { label: string; count: number; value?: React.ReactNode; tone?: Tone; onClick?: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[13px] transition-colors", onClick && "hover:bg-hover", active && "bg-active")}>
      {tone && <Dot tone={tone} className="gap-0" />}
      <span className="text-ink-2">{label}</span>
      <span className="num font-medium text-ink">{count}</span>
      {value !== undefined && <span className="num text-gold-ink">{value}</span>}
    </button>
  );
}

/** Current custodian name as the custody ledger labels it (agent / shop name, "Vault", "Sold"). */
export function holderLabel(p: { custodianType: string; custodian: { agentName?: string; shopName?: string } }) {
  return p.custodianType === "AGENT" ? p.custodian.agentName ?? "Agent" : p.custodianType === "SHOP" ? p.custodian.shopName ?? "Shop" : p.custodianType === "VAULT" ? "Vault" : p.custodianType === "SOLD" ? "Sold" : "Lost";
}

/** False on the server and during hydration, true after. Pages share query keys with the shell
 *  (gold rates, me), so cached data can land before a page's Suspense boundary hydrates; gating the
 *  first render on this keeps server and client HTML identical. */
const noop = () => () => {};
export function useHydrated() {
  return React.useSyncExternalStore(noop, () => true, () => false);
}
