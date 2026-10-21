"use client";
import { AlertCircle, RotateCw } from "lucide-react";
import { formatINRCompact } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Chip, Dot, type Tone } from "@/components/app/chrome";
import type { VisitStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { plural, sizedMedia } from "./format";

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
export const VisitDot = ({ status, className }: { status: VisitStatus; className?: string }) => (
  <Dot tone={VISIT[status][0]} className={cn("text-[13px] text-ink-2", className)}>{VISIT[status][1]}</Dot>
);

export function ErrorState({ title, message, onRetry, className }: { title: string; message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <AlertCircle className="size-5 text-danger" strokeWidth={1.75} />
      <p className="mt-3 text-[15px] font-medium text-ink">{title}</p>
      {message && <p className="mt-1 max-w-sm text-[14px] text-ink-2">{message}</p>}
      {onRetry && <Button variant="outline" className="mt-5 h-11 px-4" onClick={onRetry}><RotateCw />Try again</Button>}
    </div>
  );
}

export function SectionTitle({ children, aside, className }: { children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 px-4", className)}>
      <h2 className="text-[13px] font-semibold text-ink">{children}</h2>
      {aside && <div className="text-[13px] text-ink-3">{aside}</div>}
    </div>
  );
}

/** Label/value property row (Attio attribute rail). */
export function Attr({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-baseline gap-3 py-2.5">
      <dt className="text-[14px] text-ink-2">{label}</dt>
      <dd className="min-w-0 text-[14px] text-ink">{children}</dd>
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
