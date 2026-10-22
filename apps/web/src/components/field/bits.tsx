"use client";
import Link from "next/link";
import { useKbdFocus } from "@/lib/use-kbd-focus";
import { AlertCircle, ChevronRight, RotateCw } from "lucide-react";
import { formatINR, formatINRCompact } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Chip, Dot, type Tone } from "@/components/app/chrome";
import type { VisitStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { plural, sizedMedia } from "./format";
import { useVisitCredit } from "./queries";
import type { VisitDetail } from "./types";

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

/** Press feedback (emil-design-eng): 150 ms strong ease-out, scale 0.97, only when motion is allowed.
 *  `PRESS_BTN` also cancels shadcn Button's own 1 px nudge so the two don't stack. */
export const EASE_OUT = "ease-[cubic-bezier(0.23,1,0.32,1)]";
export const PRESS = `transition-[transform,background-color,border-color,color,opacity] duration-150 ${EASE_OUT} motion-safe:active:scale-[0.97]`;
export const PRESS_BTN = `${PRESS} active:not-aria-[haspopup]:translate-y-0`;
/** Full-width list rows don't scale (it reads as the page wobbling); they darken under the finger. */
export const PRESS_ROW = "transition-colors duration-150 hover:bg-hover active:bg-sunken";

/** "2 active memos" — gold because it is custody. Optional compact value. */
export function MemoChip({ count, valuePaise, className }: { count: number; valuePaise?: number; className?: string }) {
  if (!count) return null;
  return (
    <Chip tone="gold" className={className}>
      {plural(count, "active memo")}
      {valuePaise ? <span className="num font-semibold">{formatINRCompact(valuePaise)}</span> : null}
    </Chip>
  );
}

const VISIT: Record<VisitStatus, [Tone, string]> = {
  PLANNED: ["grey", "Planned"], CHECKED_IN: ["blue", "Checked in"], ACTIVE: ["blue", "In visit"],
  COMPLETED: ["green", "Completed"], MISSED: ["red", "Missed"], CANCELLED: ["grey", "Cancelled"],
};
export const visitLabel = (s: VisitStatus) => VISIT[s][1];
export const VisitDot = ({ status, className }: { status: VisitStatus; className?: string }) => (
  <Dot tone={VISIT[status][0]} className={cn("text-[13px] text-ink-2", className)}>{VISIT[status][1]}</Dot>
);
/** Record-header status (DESIGN v3: soft chip in record headers, dot + label in lists). */
export const VisitChip = ({ status, className }: { status: VisitStatus; className?: string }) => (
  <Chip tone={VISIT[status][0]} className={className}>
    <span className={cn("size-1.5 rounded-full bg-current")} aria-hidden />{VISIT[status][1]}
  </Chip>
);

export function ErrorState({ title, message, onRetry, className }: { title: string; message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)} role="alert">
      <span className="grid size-10 place-items-center rounded-full bg-danger-soft"><AlertCircle className="size-5 text-danger" strokeWidth={1.75} /></span>
      <p className="mt-3 text-[15px] font-medium text-ink">{title}</p>
      {message && <p className="mt-1 max-w-sm text-[14px] text-ink-2">{message}</p>}
      {onRetry && <Button variant="outline" className={cn("mt-5 h-11 px-4 text-[15px]", PRESS_BTN)} onClick={onRetry}><RotateCw />Try again</Button>}
    </div>
  );
}

/** Empty state for the phone: small icon in a soft disc, one line, one line of guidance, one action. */
export function FieldEmpty({ icon: I, title, hint, action, className }: { icon: Icon; title: string; hint?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-8 py-12 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-full bg-sunken"><I className="size-5 text-ink-2" strokeWidth={1.75} /></span>
      <p className="mt-3 text-[15px] font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-[14px] leading-snug text-ink-2">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, aside, className, id }: { children: React.ReactNode; aside?: React.ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 px-4", className)} id={id}>
      <h2 className="text-[13px] font-semibold text-ink">{children}</h2>
      {aside && <div className="min-w-0 truncate text-[13px] text-ink-3">{aside}</div>}
    </div>
  );
}

/** Label/value property row (Attio attribute rail). */
export function Attr({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-baseline gap-3 py-2.5">
      <dt className="text-[14px] text-ink-2">{label}</dt>
      <dd className="min-w-0 break-words text-[14px] text-ink">{children}</dd>
    </div>
  );
}

export function Thumb({ src, size = 44, className, alt = "" }: { src?: string | null; size?: number; className?: string; alt?: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={sizedMedia(src, size * 3)} alt={alt} width={size} height={size} loading="lazy" className={cn("shrink-0 rounded-lg bg-sunken object-cover", className)} style={{ width: size, height: size }} />
    : <span className={cn("shrink-0 rounded-lg bg-sunken", className)} style={{ width: size, height: size }} />;
}

/** A soft panel separated by hairlines — not a card. */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-xl border border-line bg-paper", className)}>{children}</div>;
}

/* ---------- Status callout ---------- */
const NOTICE: Record<"ok" | "warn" | "danger" | "info" | "neutral", { box: string; icon: string; title: string }> = {
  ok: { box: "border-verified/20 bg-verified-soft", icon: "text-verified", title: "text-verified" },
  warn: { box: "border-warn/20 bg-warn-soft", icon: "text-warn", title: "text-ink" },
  danger: { box: "border-danger/15 bg-danger-soft", icon: "text-danger", title: "text-ink" },
  info: { box: "border-info/15 bg-info-soft", icon: "text-info", title: "text-ink" },
  neutral: { box: "border-line bg-paper", icon: "text-ink-3", title: "text-ink" },
};
/** One anatomy for every state callout on the phone: icon, a title that says what is true, one line on
 *  what to do, optional actions. `role` lets urgent ones announce themselves. */
export function Notice({ tone = "neutral", icon: I, title, children, action, aside, className, role }: {
  tone?: keyof typeof NOTICE; icon?: Icon; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; aside?: React.ReactNode; className?: string; role?: "alert" | "status";
}) {
  const t = NOTICE[tone];
  return (
    <div role={role} aria-live={role === "status" ? "polite" : undefined} className={cn("rounded-xl border px-4 py-3.5", t.box, className)}>
      <div className="flex items-start gap-3">
        {I && <I className={cn("mt-px size-5 shrink-0", t.icon)} strokeWidth={1.9} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className={cn("min-w-0 text-[15px] font-semibold leading-snug", t.title)}>{title}</p>
            {aside}
          </div>
          {children && <div className="mt-0.5 text-[14px] leading-snug text-ink-2">{children}</div>}
          {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Tappable list row ---------- */
/** 52 px row: icon, label, quiet hint, chevron. A link when it navigates, a button when it opens a sheet. */
export function TapRow({ href, onClick, icon: I, label, hint, disabled, gold, className }: {
  href?: string; onClick?: () => void; icon: Icon; label: string; hint?: React.ReactNode; disabled?: boolean; gold?: boolean; className?: string;
}) {
  const cls = cn("flex min-h-[52px] w-full items-center gap-3 px-4 text-left", PRESS_ROW, disabled && "pointer-events-none", className);
  const body = (
    <>
      <I className={cn("size-5 shrink-0", disabled ? "text-ink-3" : gold ? "text-gold" : "text-ink-2")} strokeWidth={1.75} />
      <span className={cn("flex-1 text-[15px] font-medium", disabled ? "text-ink-3" : "text-ink")}>{label}</span>
      {hint && <span className="shrink-0 text-[13px] text-ink-3">{hint}</span>}
      <ChevronRight className={cn("size-4 shrink-0", disabled ? "text-line-strong" : "text-ink-3")} />
    </>
  );
  return href && !disabled
    ? <Link href={href} className={cls}>{body}</Link>
    : <button type="button" onClick={onClick} disabled={disabled} aria-disabled={disabled} className={cls}>{body}</button>;
}

/* ---------- Segmented control (Radix Tabs, styled as an iOS segmented control) ---------- */
/** URL-driven segmented control. `wrap` places the tab list (e.g. inside a sticky PageBar) while the Tabs
 *  root still wraps the page body, which renders as the active tab panel. */
export function Segmented<T extends string>({ value, onChange, items, label, className, children, wrap }: {
  value: T; onChange: (v: T) => void; label: string; className?: string; children?: React.ReactNode;
  items: { value: T; label: React.ReactNode }[]; wrap?: (list: React.ReactNode) => React.ReactNode;
}) {
  const kbd = useKbdFocus(); // keyboard focus gets a ring, a tap does not
  const list = (
    <div className={cn("px-4 pb-2.5", className)}>
      <TabsList {...kbd} aria-label={label} className="group/kbd grid h-10 w-full rounded-[10px] bg-sunken p-[3px]" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) => (
          <TabsTrigger key={it.value} value={it.value}
            className="h-full rounded-[8px] border-0 text-[14px] font-medium text-ink-2 shadow-none outline-none transition-[background-color,color,box-shadow] duration-150 hover:text-ink focus-visible:border-0 focus-visible:ring-0 focus-visible:outline-none group-data-[kbd]/kbd:focus-visible:ring-[3px] group-data-[kbd]/kbd:focus-visible:ring-blue/35 data-[state=active]:bg-paper data-[state=active]:text-ink data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_0.5px_rgb(0_0_0/0.08)]">
            {it.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className="block gap-0">
      {wrap ? wrap(list) : list}
      <TabsContent value={value} className="flex-none text-[length:inherit] outline-none">{children}</TabsContent>
    </Tabs>
  );
}

/* ---------- Money at this shop ---------- */
function Cell({ label, value, sub, title, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; title?: string; tone?: "gold" | "danger" }) {
  return (
    <div className="min-w-0 px-3 py-2.5" title={title}>
      <dt className="truncate text-[12px] text-ink-2">{label}</dt>
      <dd className={cn("num mt-0.5 truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]", tone === "gold" ? "text-gold-ink" : tone === "danger" ? "text-danger" : "text-ink")}>{value}</dd>
      {sub && <dd className="mt-0.5 truncate text-[12px] text-ink-3">{sub}</dd>}
    </div>
  );
}

/** What Rahul needs to know about money at the counter, all from the server: on an open visit the shop's
 *  live credit position (`GET /visits/:id/credit`); before check-in only the credit limit is known. */
export function ShopMoney({ d, className, bare }: { d: VisitDetail; className?: string; bare?: boolean }) {
  const { visit, shop } = d;
  const open = visit.status === "CHECKED_IN" || visit.status === "ACTIVE";
  const credit = useVisitCredit(visit.id, open);
  const c = credit.data;
  const memo = (
    <Cell label="On memo here" tone={visit.activeMemoCount ? "gold" : undefined}
      value={visit.activeMemoCount ? formatINRCompact(visit.activeMemoValuePaise) : <span className="font-normal text-ink-3">None</span>}
      sub={visit.activeMemoCount ? plural(visit.activeMemoCount, "memo") : "Nothing out"}
      title={visit.activeMemoCount ? formatINR(visit.activeMemoValuePaise) : undefined} />
  );
  let left: React.ReactNode; let mid: React.ReactNode;
  if (open && credit.isPending) {
    left = <div className="px-3 py-2.5"><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-4 w-14" /></div>;
    mid = <div className="px-3 py-2.5"><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-4 w-14" /></div>;
  } else if (open && c) {
    const unlimited = c.availableCreditPaise == null;
    const over = !unlimited && (c.overLimit || (c.availableCreditPaise ?? 0) <= 0);
    left = <Cell label="Available credit" tone={over ? "danger" : undefined}
      value={unlimited ? <span className="font-normal text-ink-2">No limit</span> : formatINRCompact(Math.max(0, c.availableCreditPaise!))}
      sub={unlimited ? "No credit limit set" : over ? "Over the limit" : <>of <span className="num">{formatINRCompact(c.creditLimitPaise)}</span></>}
      title={unlimited ? undefined : formatINR(c.availableCreditPaise!)} />;
    mid = <Cell label="Outstanding" value={formatINRCompact(c.outstandingPaise)} sub="Not yet settled" title={formatINR(c.outstandingPaise)} />;
  } else {
    // Closed, not yet checked in, or the credit read failed: only the limit is known for sure.
    left = <Cell label="Credit limit" value={shop.creditLimitPaise ? formatINRCompact(shop.creditLimitPaise) : <span className="font-normal text-ink-2">No limit</span>}
      sub={open && credit.isError ? "Live credit unavailable" : open ? undefined : "Live at check-in"} title={shop.creditLimitPaise ? formatINR(shop.creditLimitPaise) : undefined} />;
    const last = d.shopContext.previousOrders[0];
    mid = <Cell label="Last order" value={last ? formatINRCompact(last.totalPaise) : <span className="font-normal text-ink-3">None</span>} sub={last ? last.number : "No orders yet"} title={last ? formatINR(last.totalPaise) : undefined} />;
  }
  return (
    <dl aria-label={`Money at ${shop.name}`} className={cn("grid grid-cols-3 divide-x divide-line", bare ? "border-t border-line" : "mx-4 rounded-xl border border-line", className)}>
      {left}{mid}{memo}
    </dl>
  );
}

