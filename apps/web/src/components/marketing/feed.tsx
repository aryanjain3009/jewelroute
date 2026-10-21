/** The app's activity timeline (components/app/timeline.tsx markup) with fixed clock times, so a
 *  static page never shows "just now" for sample data. */
import { cn } from "@/lib/utils";

export interface FeedItem { id: string; lead: React.ReactNode; text: React.ReactNode; time: string; right?: React.ReactNode; body?: React.ReactNode }

/** `highlight` marks one row with the app's selection tint (a colour change, no movement). */
export function Feed({ items, label, className, highlight }: { items: FeedItem[]; label?: string; className?: string; highlight?: string }) {
  return (
    <div className={className}>
      {label && <h3 className="mb-2 text-[13px] font-semibold text-ink">{label}</h3>}
      <ol className="relative">
        {items.map((it, i) => (
          <li key={it.id} className="relative isolate flex gap-3 pb-3 last:pb-0">
            <span className={cn("pointer-events-none absolute -inset-x-2 -top-1 bottom-1 -z-10 rounded-[8px] transition-colors duration-200 ease-out", highlight === it.id ? "bg-selected" : "bg-transparent")} aria-hidden />
            {i < items.length - 1 && <span className="absolute top-6 bottom-0 left-[9.5px] border-l border-dotted border-line-strong" aria-hidden />}
            <span className="relative z-[1] mt-0.5 shrink-0">{it.lead}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 text-[13.5px] leading-6 text-ink-2 [&_b]:font-medium [&_b]:text-ink">{it.text}</p>
                {it.right && <span className="shrink-0 pt-0.5 text-[13px]">{it.right}</span>}
                <span className="num shrink-0 whitespace-nowrap pt-0.5 text-[12.5px] text-ink-3">{it.time}</span>
              </div>
              {it.body && <div className={cn("mt-1.5 rounded-[10px] border border-line p-2.5")}>{it.body}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
