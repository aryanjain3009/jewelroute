"use client";
/** Attio activity timeline: grouped by Today / Yesterday / This week / Earlier, avatar or icon on a
 *  dotted connector, "Actor verb object" sentence, time on the right, optional nested card. */
import * as React from "react";
import { cn } from "@/lib/utils";

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

export interface TimelineItem {
  id: string;
  at: string;                 // ISO
  lead: React.ReactNode;      // <Avatar/> or an icon bubble
  text: React.ReactNode;      // sentence; wrap actor/object in <b>
  right?: React.ReactNode;    // amount, link
  body?: React.ReactNode;     // nested card
  onClick?: () => void;
  tone?: "danger" | "warn";
}

const IST = "Asia/Kolkata";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

function groupOf(iso: string, now: Date): string {
  const d = new Date(iso);
  const k = dayKey(d), today = dayKey(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (k === today) return "Today";
  if (k === dayKey(y)) return "Yesterday";
  if (now.getTime() - d.getTime() < 7 * 86400000) return "This week";
  return "Earlier";
}
export function relTime(iso: string, now = new Date()): string {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 0) {
    const m = Math.round(-s / 60);
    if (m < 1) return "in under a minute";
    return m < 60 ? `in ${m} min` : new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  }
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 && dayKey(new Date(iso)) === dayKey(now)) return new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit" }).format(new Date(iso)).toLowerCase();
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(",", " ·").toLowerCase().replace(/^(\d+ )(\w)/, (_, a, b) => a + b.toUpperCase());
}

export function Timeline({ items, grouped = true, empty, className }: { items: TimelineItem[]; grouped?: boolean; empty?: React.ReactNode; className?: string }) {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  if (!items.length) return <>{empty ?? null}</>;
  const n = now ?? new Date(0);
  const groups: { label: string; items: TimelineItem[] }[] = [];
  for (const it of items) {
    const g = grouped && now ? groupOf(it.at, n) : "";
    const last = groups[groups.length - 1];
    if (last && last.label === g) last.items.push(it); else groups.push({ label: g, items: [it] });
  }
  return (
    <div className={cn("@container flex flex-col gap-4", className)}>
      {groups.map((g, gi) => (
        <div key={gi + g.label}>
          {g.label && <h3 className="mb-2 text-[13px] font-semibold text-ink">{g.label}</h3>}
          <ol className="relative">
            {g.items.map((it, i) => (
              <li key={it.id} className="relative flex gap-3 pb-3 last:pb-0">
                {i < g.items.length - 1 && <span className="absolute left-[9.5px] top-6 bottom-0 border-l border-dotted border-line-strong" aria-hidden />}
                <span className="relative z-[1] mt-0.5 shrink-0">{it.lead}</span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn("flex items-start gap-3", it.onClick && "-mx-1.5 cursor-pointer rounded-md px-1.5 hover:bg-hover")}
                    onClick={it.onClick}
                    role={it.onClick ? "button" : undefined}
                    tabIndex={it.onClick ? 0 : undefined}
                    onKeyDown={it.onClick ? (e) => { if (e.key === "Enter") it.onClick!(); } : undefined}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[14px] leading-6 text-ink-2 [&_b]:font-medium [&_b]:text-ink", it.tone === "danger" && "[&_b]:text-danger", it.tone === "warn" && "[&_b]:text-warn")}>{it.text}</p>
                      {/* Narrow containers (rails, previews): amount and time sit under the sentence instead of squeezing it. */}
                      <p className="flex items-center gap-1.5 text-[12.5px] leading-5 text-ink-3 @lg:hidden">
                        {it.right && <span className="text-[12.5px]">{it.right}</span>}
                        {it.right && <span aria-hidden>·</span>}
                        <time dateTime={it.at} suppressHydrationWarning>{now ? relTime(it.at, n) : ""}</time>
                      </p>
                    </div>
                    {it.right && <span className="hidden shrink-0 pt-0.5 text-[13px] @lg:block">{it.right}</span>}
                    <time dateTime={it.at} className="hidden shrink-0 whitespace-nowrap pt-0.5 text-[13px] text-ink-3 @lg:block" suppressHydrationWarning>{now ? relTime(it.at, n) : ""}</time>
                  </div>
                  {it.body && <div className="mt-1.5 rounded-[10px] border border-line p-3">{it.body}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** 20px icon bubble for system events in a timeline. */
export function IconBubble({ icon: I, tone = "grey" }: { icon: Icon; tone?: "grey" | "green" | "amber" | "red" | "blue" | "gold" }) {
  const c = { grey: "bg-[#f1f1f2] text-ink-2", green: "bg-verified-soft text-verified", amber: "bg-warn-soft text-warn", red: "bg-danger-soft text-danger", blue: "bg-info-soft text-info", gold: "bg-gold-soft text-gold-ink" }[tone];
  return <span className={cn("grid size-5 place-items-center rounded-full", c)}><I className="size-3" strokeWidth={2} /></span>;
}
