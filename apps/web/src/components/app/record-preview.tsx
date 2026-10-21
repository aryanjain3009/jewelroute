"use client";
/** Attio record preview: a right-hand panel next to the list you're in (the table stays usable and the
 *  previewed row stays highlighted). Header "3 of 24 in All shops", ↑ ↓ to step through the view,
 *  expand to open the full record, ✕ / Esc to close. Attio help: "Preview a record from a table view". */
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDownIcon, ChevronUpIcon, Maximize2Icon, XIcon } from "lucide-react";
import { useUrlState } from "@/lib/url-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ICON_BTN = "press grid size-7 place-items-center rounded-md text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-blue/35 disabled:pointer-events-none disabled:opacity-35";
function Tip({ label, k, children }: { label: string; k?: string; children: React.ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side="bottom" className="flex items-center gap-2">{label}{k && <span className="rounded-[4px] bg-white/15 px-1 text-[11px]">{k}</span>}</TooltipContent></Tooltip>;
}

export interface PreviewState {
  id: string | null;
  open: (id: string) => void;
  close: () => void;
  step: (d: 1 | -1) => void;
  index: number;
  total: number;
  /** Feed the current (sorted, filtered) row order from the table. */
  setOrder: (ids: string[]) => void;
}

/** Preview selection over the table's visible order. ↑/↓ step while open; Esc closes. The previewed
 *  record lives in the URL (?preview=<id>), so a hard refresh or Back to the list reopens the same panel. */
export function usePreview(): PreviewState {
  const [urlId, setUrlId] = useUrlState("preview");
  const id = urlId || null;
  const idRef = React.useRef<string | null>(id);
  idRef.current = id;
  const [order, setOrderState] = React.useState<string[]>([]);
  const orderRef = React.useRef<string[]>([]);
  const setOrder = React.useCallback((ids: string[]) => {
    if (ids.join() === orderRef.current.join()) return;
    orderRef.current = ids;
    setOrderState(ids);
  }, []);
  const index = id ? order.indexOf(id) : -1;
  const open = React.useCallback((next: string) => setUrlId(next), [setUrlId]);
  const close = React.useCallback(() => setUrlId(""), [setUrlId]);
  const step = React.useCallback((d: 1 | -1) => {
    const o = orderRef.current;
    if (!o.length) return;
    const cur = idRef.current;
    const i = cur ? o.indexOf(cur) : -1;
    const next = o[Math.min(o.length - 1, Math.max(0, i + d))];
    if (next && next !== cur) setUrlId(next);
  }, [setUrlId]);
  React.useEffect(() => {
    if (!id) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input,textarea,select,[contenteditable=true]") || t.closest("[role=dialog]"))) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); step(-1); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [id, step, close]);
  return { id, open, close, step, index, total: order.length, setOrder };
}

export function RecordPreview({ state, viewLabel, href, children, width = 600 }: {
  state: PreviewState;
  /** "All shops", "Pending approval" … — shown as "3 of 24 in <view>". */
  viewLabel: string;
  /** Full record page for the expand button. */
  href?: string;
  children: React.ReactNode;
  width?: number;
}) {
  // emil-design-eng: panels enter on the iOS drawer curve (~220 ms) and leave faster than they came;
  // reduced motion keeps the fade and drops the slide. Hardware-accelerated transform strings.
  const reduce = useReducedMotion();
  const off = reduce ? "translateX(0px)" : "translateX(28px)";
  return (
    <AnimatePresence>
      {state.id && (
        <motion.aside
          key="preview"
          role="complementary"
          aria-label="Record preview"
          initial={{ transform: off, opacity: 0 }}
          animate={{ transform: "translateX(0px)", opacity: 1, transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] } }}
          exit={{ transform: off, opacity: 0, transition: { duration: 0.14, ease: [0.23, 1, 0.32, 1] } }}
          className="fixed inset-y-0 right-0 z-40 flex max-w-[100vw] flex-col border-l border-line-strong bg-white shadow-[-12px_0_32px_-12px_rgb(0_0_0/0.14)]"
          style={{ width }}
        >
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3">
            <Tip label="Previous record" k="↑"><button type="button" aria-label="Previous record" disabled={state.index <= 0} onClick={() => state.step(-1)} className={ICON_BTN}><ChevronUpIcon className="size-4" /></button></Tip>
            <Tip label="Next record" k="↓"><button type="button" aria-label="Next record" disabled={state.index < 0 || state.index >= state.total - 1} onClick={() => state.step(1)} className={ICON_BTN}><ChevronDownIcon className="size-4" /></button></Tip>
            <span className="ml-1 truncate text-[13px] text-ink-2">
              {state.index >= 0 ? <><span className="num text-ink">{state.index + 1}</span> of <span className="num">{state.total}</span> in {viewLabel}</> : viewLabel}
            </span>
            <span className="ml-auto" />
            {href && (
              <Tip label="Open full record"><Link href={href} aria-label="Open full record" className={ICON_BTN}><Maximize2Icon className="size-3.5" /></Link></Tip>
            )}
            <Tip label="Close" k="esc"><button type="button" aria-label="Close preview" onClick={state.close} className={ICON_BTN}><XIcon className="size-4" /></button></Tip>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/** Preview body layout: header block, then titled sections separated by hairlines. */
export function PreviewHeader({ lead, title, subtitle, status, actions }: { lead: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; status?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="border-b border-line px-5 py-4">
      <div className="flex items-center gap-3">
        {lead}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em] text-ink" title={typeof title === "string" ? title : undefined}>{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-ink-2">{subtitle}</p>}
        </div>
        {status}
      </div>
      {actions && <div className="mt-3 flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}
export function PreviewSection({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4 last:border-b-0">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[14px] font-medium text-ink">{title}</h3>
        {count !== undefined && <span className="num text-[13px] text-ink-3">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}
