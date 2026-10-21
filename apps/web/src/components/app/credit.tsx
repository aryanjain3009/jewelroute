"use client";
/** Credit exposure, exactly as the API computed it (`CreditPosition`, contract v3). The UI never
 *  adds these up: it only draws the figures and a thin bar of outstanding + memo against the limit. */
import * as React from "react";
import { formatINR, formatINRCompact } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
import type { CreditPosition, OrderApproval } from "@/lib/types";
import { reasonText } from "./status";

const pct = (v: number, of: number) => (of > 0 ? Math.max(0, Math.min(100, (v / of) * 100)) : 0);

/** Thin exposure bar: outstanding (ink) + memo samples (gold) [+ this order, hatched] against the limit
 *  tick. When exposure runs past the limit the scale stretches and the overflow turns red. */
export function ExposureBar({ p, className, showOrder = true }: { p: CreditPosition; className?: string; showOrder?: boolean }) {
  if (!p.creditLimitPaise) return null;
  const order = showOrder ? p.orderAmountPaise : 0;
  const total = p.exposurePaise + order;
  const scale = Math.max(p.creditLimitPaise, total);
  const limitAt = pct(p.creditLimitPaise, scale);
  const out = pct(p.outstandingPaise, scale);
  const memo = pct(p.memoExposurePaise, scale);
  const ord = pct(order, scale);
  const over = total > p.creditLimitPaise;
  return (
    <div className={cn("relative h-1.5 w-full", className)} role="img" aria-label={`Exposure ${formatINRCompact(p.exposurePaise)} of ${formatINRCompact(p.creditLimitPaise)} limit`}>
      <div className="absolute inset-0 overflow-hidden rounded-full bg-[#efefef]">
        <div className="flex h-full">
          <span className="h-full bg-[#55565a]" style={{ width: `${out}%` }} />
          <span className="h-full bg-gold" style={{ width: `${memo}%` }} />
          {ord > 0 && <span className={cn("h-full", over ? "bg-danger/70" : "bg-[#9b9ca0]")} style={{ width: `${ord}%`, backgroundImage: "repeating-linear-gradient(135deg, rgb(255 255 255 / .55) 0 2px, transparent 2px 5px)" }} />}
        </div>
        {over && <span className="absolute inset-y-0 right-0 bg-danger/25" style={{ left: `${limitAt}%` }} />}
      </div>
      {over && <span className="absolute -top-0.5 h-2.5 w-px bg-ink" style={{ left: `${limitAt}%` }} aria-hidden />}
    </div>
  );
}

/** "₹6.2L of ₹10L" + bar + legend. For property panels and highlight cards. */
export function ExposureSummary({ p, className }: { p: CreditPosition; className?: string }) {
  if (!p.creditLimitPaise) return <span className={cn("text-ink-3", className)}>No credit limit set</span>;
  return (
    <span className={cn("flex w-full flex-col gap-1.5", className)}>
      <span className="num">
        <span className={cn("font-medium", p.exposurePaise > p.creditLimitPaise ? "text-danger" : "text-ink")}>{formatINRCompact(p.exposurePaise)}</span>
        <span className="text-ink-3"> of {formatINRCompact(p.creditLimitPaise)} limit</span>
      </span>
      <ExposureBar p={p} showOrder={false} />
      <span className="flex flex-wrap gap-x-3 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#55565a]" />Outstanding {formatINRCompact(p.outstandingPaise)}</span>
        <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-gold" />On memo {formatINRCompact(p.memoExposurePaise)}</span>
      </span>
    </span>
  );
}

/** The five figures an approver needs, frozen at order time (or prospective on the field review). */
export function CreditFigures({ p, dense, className }: { p: CreditPosition; dense?: boolean; className?: string }) {
  const unlimited = !p.creditLimitPaise;
  const rows: [string, React.ReactNode, string?][] = [
    ["Outstanding", formatINR(p.outstandingPaise), p.memoExposurePaise ? `+ ${formatINRCompact(p.memoExposurePaise)} samples on memo` : undefined],
    ["Credit limit", unlimited ? <span className="text-ink-3">No limit</span> : formatINR(p.creditLimitPaise)],
    ["Available credit", p.availableCreditPaise == null ? <span className="text-ink-3">No limit</span> : <span className={cn(p.availableCreditPaise === 0 && "text-danger")}>{formatINR(p.availableCreditPaise)}</span>],
    ["Order amount", <span key="o" className="font-medium text-gold-ink">{formatINR(p.orderAmountPaise)}</span>],
    ["Projected exposure", <span key="e" className={cn("font-medium", !unlimited && p.projectedExposurePaise > p.creditLimitPaise ? "text-danger" : "text-ink")}>{formatINR(p.projectedExposurePaise)}</span>, "Outstanding + memo + this order"],
  ];
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {rows.map(([k, v, sub]) => (
        <div key={k} className={cn("flex items-baseline justify-between gap-4", dense ? "py-1.5" : "py-2")}>
          <dt className="text-[14px] text-ink-2">{k}{sub && <span className="block text-[12px] text-ink-3">{sub}</span>}</dt>
          <dd className="num shrink-0 text-right text-[14px] text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Reasons a rule tripped, phrased from the frozen position ("Over credit limit by ₹2.4L"). */
export function ApprovalReasons({ approval, className }: { approval: Pick<OrderApproval, "reasons" | "position">; className?: string }) {
  if (!approval.reasons.length) return null;
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {approval.reasons.map((r) => (
        <li key={r} className="flex items-center gap-2 text-[14px] text-ink"><span className="size-1.5 shrink-0 rounded-full bg-warn" />{reasonText(r, approval.position)}</li>
      ))}
    </ul>
  );
}
