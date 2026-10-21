"use client";
/** Attio-grade page chrome: title bar, view bar, sort/filter bar, buttons, chips, empty states.
 *  Measurements follow docs/DESIGN.md v2 (CSS px). Keep these small and quiet. */
import * as React from "react";
import { ChevronDownIcon, InfoIcon, ListFilterIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

/* ---------- Buttons ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "dashed" | "danger";
  size?: "sm" | "md";
  icon?: Icon;
  iconRight?: Icon;
};
export const Btn = React.forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { variant = "default", size = "md", icon: I, iconRight: IR, className, children, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-45",
        size === "md" ? "h-8 px-3 text-[14px]" : "h-7 px-2.5 text-[13px]",
        !children && (size === "md" ? "w-8 px-0" : "w-7 px-0"),
        variant === "default" && "border border-line-strong bg-white text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:bg-hover",
        variant === "primary" && "bg-ink text-white shadow-[0_1px_2px_rgb(0_0_0/0.12)] hover:bg-ink/90",
        variant === "ghost" && "text-ink-2 hover:bg-hover hover:text-ink",
        variant === "dashed" && "border border-dashed border-line-strong text-ink-2 hover:bg-hover hover:text-ink",
        variant === "danger" && "border border-line-strong bg-white text-danger hover:bg-danger-soft",
        className,
      )}
    >
      {I && <I className="size-4 shrink-0" strokeWidth={1.75} />}
      {children}
      {IR && <IR className="size-3.5 shrink-0 text-ink-3" strokeWidth={2} />}
    </button>
  );
});

/* ---------- Page chrome ---------- */
export function TitleBar({ icon: I, iconClass, title, info, children }: { icon?: Icon; iconClass?: string; title: React.ReactNode; info?: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-5">
      {I && (
        <span className={cn("grid size-5 place-items-center rounded-[5px] text-white", iconClass ?? "bg-ink")}>
          <I className="size-3.5" strokeWidth={2} />
        </span>
      )}
      <h1 className="truncate text-[15px] font-medium text-ink">{title}</h1>
      {info && (
        <Tooltip>
          <TooltipTrigger asChild><InfoIcon className="size-3.5 text-ink-3" /></TooltipTrigger>
          <TooltipContent className="max-w-xs">{info}</TooltipContent>
        </Tooltip>
      )}
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}

export function ViewBar({ children, right }: { children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
      {children}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

/** Segmented "views" control styled as Attio's view selector (a row of quiet tabs). */
export function ViewTabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number; icon?: Icon }[] }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line-strong bg-white p-0.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
            value === it.value ? "bg-active text-ink" : "text-ink-2 hover:text-ink",
          )}
        >
          {it.icon && <it.icon className="size-3.5" strokeWidth={1.75} />}
          {it.label}
          {it.count !== undefined && <span className="num text-[12px] text-ink-3">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ children, right }: { children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-line px-5 py-2">
      {children}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={cn("flex h-7 w-56 items-center gap-1.5 rounded-lg border border-line-strong bg-white px-2 text-[13px] focus-within:border-blue focus-within:ring-2 focus-within:ring-blue/15", className)}>
      <SearchIcon className="size-3.5 text-ink-3" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
      {value && <button type="button" aria-label="Clear search" onClick={() => onChange("")}><XIcon className="size-3.5 text-ink-3" /></button>}
    </label>
  );
}

/** "Sorted by X" chip — Attio's sort affordance. Cycles through options on click. */
export function SortChip<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const cur = options.find((o) => o.value === value) ?? options[0];
  return (
    <button
      type="button"
      onClick={() => { const i = options.findIndex((o) => o.value === value); onChange(options[(i + 1) % options.length].value); }}
      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line-strong bg-white px-2.5 text-[13px] text-ink-2 hover:bg-hover"
    >
      <ListFilterIcon className="size-3.5" />Sorted by <span className="font-medium text-ink">{cur.label}</span>
    </button>
  );
}

/** A filter control rendered as a chip with a native select underneath (keyboard + a11y for free). */
export function FilterChip({ label, value, onChange, options, icon: I }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; icon?: Icon }) {
  const active = value !== "" && value !== "all";
  const cur = options.find((o) => o.value === value);
  return (
    <label className={cn(
      "relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[13px]",
      active ? "border-blue/30 bg-selected text-ink" : "border-dashed border-line-strong text-ink-2 hover:bg-hover",
    )}>
      {I && <I className="size-3.5" strokeWidth={1.75} />}
      <span>{label}{active && <>: <span className="font-medium">{cur?.label}</span></>}</span>
      <ChevronDownIcon className="size-3 text-ink-3" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/* ---------- Status ---------- */
export type Tone = "grey" | "green" | "amber" | "red" | "blue" | "gold" | "ink";
const DOT: Record<Tone, string> = { grey: "bg-[#c4c5c9]", green: "bg-verified", amber: "bg-warn", red: "bg-danger", blue: "bg-blue", gold: "bg-gold", ink: "bg-ink" };
const CHIP: Record<Tone, string> = {
  grey: "bg-[#f1f1f2] text-ink-2", green: "bg-verified-soft text-verified", amber: "bg-warn-soft text-warn", red: "bg-danger-soft text-danger",
  blue: "bg-info-soft text-info", gold: "bg-gold-soft text-gold-ink", ink: "bg-ink text-white",
};
/** Attio table status: coloured 8px dot + plain label. */
export function Dot({ tone, children, className }: { tone: Tone; children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap text-[14px] text-ink", className)}>
      <span className={cn("size-2 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}
/** Soft rounded chip (Attio "select" option). */
export function Chip({ tone = "grey", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-[6px] px-1.5 text-[12.5px] font-medium", CHIP[tone], className)}>{children}</span>;
}
export function CountBadge({ n, className }: { n: number | string; className?: string }) {
  return <span className={cn("num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-line-strong px-1 text-[11.5px] font-medium text-ink-2", className)}>{n}</span>;
}

/* ---------- Avatars ---------- */
const AV = ["#e8eefc", "#eaf6ef", "#fdf0e3", "#f3ecfb", "#fbe9ec", "#e7f5f7"];
const AVT = ["#2f5fd0", "#24784f", "#a65e12", "#6a3fb5", "#b2334a", "#1f7480"];
export function Avatar({ name, size = 20, square, className }: { name: string; size?: number; square?: boolean; className?: string }) {
  const i = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length;
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center font-semibold", square ? "rounded-[5px]" : "rounded-full", className)}
      style={{ width: size, height: size, background: AV[i], color: AVT[i], fontSize: Math.max(9, size * 0.42) }}
      aria-hidden
    >
      {ini}
    </span>
  );
}

/* ---------- Empty / loading ---------- */
export function Empty({ icon: I, title, hint, action }: { icon?: Icon; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      {I && <I className="mb-1 size-5 text-ink-3" strokeWidth={1.75} />}
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-[13px] text-ink-2">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-10 items-center gap-3 px-5">
          <span className="size-4 rounded bg-hover" />
          <span className="h-3 w-40 animate-pulse rounded bg-hover" />
          <span className="ml-auto h-3 w-24 animate-pulse rounded bg-hover" />
        </div>
      ))}
    </div>
  );
}

/** Small uppercase-free section heading used inside panels: 13px semibold, optional count + action. */
export function SectionHeading({ children, count, action, className }: { children: React.ReactNode; count?: number; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 pb-2", className)}>
      <h2 className="text-[14px] font-medium text-ink">{children}</h2>
      {count !== undefined && <span className="num text-[13px] text-ink-3">{count}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-[18px] items-center rounded-[4px] border border-line-strong bg-white px-1 font-sans text-[11px] text-ink-3">{children}</kbd>;
}
