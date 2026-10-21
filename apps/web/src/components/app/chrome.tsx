"use client";
/** Attio-grade page chrome: title bar, view bar, sort/filter bar, buttons, chips, empty states.
 *  Measurements follow docs/DESIGN.md v2 (CSS px). Keep these small and quiet. */
import * as React from "react";
import { CheckIcon, ChevronDownIcon, InfoIcon, ListFilterIcon, SearchIcon, XIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NavToggle } from "./nav-context";

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
        "press inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue/35 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-45",
        size === "md" ? "h-8 px-3 text-[14px]" : "h-7 px-2.5 text-[13px]",
        !children && (size === "md" ? "w-8 px-0" : "w-7 px-0"),
        variant === "default" && "border border-line-strong bg-white text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:border-[#d9d9db] hover:bg-hover",
        variant === "primary" && "bg-ink text-white shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.08)] hover:bg-[#2c2d30]",
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
    <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-4 sm:px-5">
      {typeof title === "string" && <title>{`${title} · JewelRoute`}</title>}
      <NavToggle />
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
    <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-line-strong bg-white p-0.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] scrollbar-none">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          aria-pressed={value === it.value}
          className={cn(
            "press inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue/35",
            value === it.value ? "bg-active text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
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
    <label className={cn("flex h-7 w-56 items-center gap-1.5 rounded-lg border border-line-strong bg-white px-2 text-[13px] transition-[border-color,box-shadow] duration-150 hover:border-[#d9d9db] focus-within:border-blue focus-within:ring-2 focus-within:ring-blue/15", className)}>
      <SearchIcon className="size-3.5 text-ink-3" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
      {value && <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="grid size-4 place-items-center rounded text-ink-3 hover:text-ink"><XIcon className="size-3.5" /></button>}
    </label>
  );
}

/** "Sorted by X" chip — Attio's sort affordance: opens a menu of fields, the current one checked. */
export function SortChip<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const cur = options.find((o) => o.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="press inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-white px-2.5 text-[13px] text-ink-2 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-blue/35 data-[state=open]:bg-hover">
        <ListFilterIcon className="size-3.5" />Sorted by <span className="font-medium text-ink">{cur.label}</span><ChevronDownIcon className="size-3 text-ink-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-[12px] font-normal text-ink-3">Sort shops by</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value)} className="text-[13px]">
            <span className="flex-1">{o.label}</span>{o.value === value && <CheckIcon className="size-3.5 text-ink" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A filter control rendered as a chip with a native select underneath (keyboard + a11y for free). */
export function FilterChip({ label, value, onChange, options, icon: I }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; icon?: Icon }) {
  const active = value !== "" && value !== "all";
  const cur = options.find((o) => o.value === value);
  return (
    <label className={cn(
      "press relative inline-flex h-7 max-w-[260px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[13px] focus-within:ring-2 focus-within:ring-blue/35",
      active ? "border-blue/30 bg-selected text-ink" : "border-dashed border-line-strong text-ink-2 hover:border-solid hover:bg-hover hover:text-ink",
    )}>
      {I && <I className="size-3.5" strokeWidth={1.75} />}
      <span className="truncate">{label}{active && <>: <span className="font-medium">{cur?.label}</span></>}</span>
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
  // A table-shaped skeleton (header + rows with varied widths) so the page doesn't jump when data lands.
  const W = [["w-40", "w-24", "w-20"], ["w-32", "w-28", "w-16"], ["w-44", "w-20", "w-24"], ["w-36", "w-24", "w-14"]];
  return (
    <div className="min-h-0 flex-1 overflow-hidden" aria-busy aria-label="Loading">
      <div className="flex h-9 items-center gap-6 border-b border-line px-5"><span className="h-2.5 w-16 rounded bg-hover" /><span className="h-2.5 w-14 rounded bg-hover" /><span className="ml-auto h-2.5 w-12 rounded bg-hover" /></div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, i) => {
          const w = W[i % W.length];
          return (
            <div key={i} className="flex h-10 items-center gap-3 px-5" style={{ opacity: 1 - i * 0.07 }}>
              <span className="size-5 shrink-0 rounded-[5px] bg-hover" />
              <span className={cn("h-3 animate-pulse rounded bg-hover", w[0])} />
              <span className={cn("ml-6 hidden h-3 animate-pulse rounded bg-hover sm:block", w[1])} />
              <span className={cn("ml-auto h-3 animate-pulse rounded bg-hover", w[2])} />
            </div>
          );
        })}
      </div>
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
