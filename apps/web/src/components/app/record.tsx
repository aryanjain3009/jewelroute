"use client";
/** Attio record page: left details panel (400px) + main column with icon tabs (counts),
 *  "Highlights" cards and bordered list sections. */
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDownIcon, ChevronLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountBadge } from "./chrome";

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

export function RecordLayout({ back, panel, children }: { back?: { href: string; label: string }; panel: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {back && (
        <div className="flex h-11 shrink-0 items-center border-b border-line px-4">
          <Link href={back.href} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-ink-2 hover:bg-hover hover:text-ink">
            <ChevronLeftIcon className="size-3.5" />{back.label}
          </Link>
        </div>
      )}
      {/* Below lg the panel stacks above the tabs and the whole record scrolls as one page. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="shrink-0 border-b border-line lg:w-[400px] lg:overflow-y-auto lg:border-b-0 lg:border-r">{panel}</aside>
        <section className="min-w-0 flex-1 lg:overflow-y-auto">{children}</section>
      </div>
    </div>
  );
}

export function RecordHeader({ lead, title, subtitle, actions, primary }: { lead: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; primary?: React.ReactNode }) {
  return (
    <div className="border-b border-line px-5 pb-4 pt-5">
      <div className="flex items-center gap-3">
        {lead}
        <div className="min-w-0">
          <h1 className="truncate text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-ink-2">{subtitle}</p>}
        </div>
      </div>
      {(primary || actions) && (
        <div className="mt-4 flex items-center gap-1.5">
          {primary && <div className="min-w-0 flex-1 [&>*]:w-full">{primary}</div>}
          {actions}
        </div>
      )}
    </div>
  );
}

/** Collapsible "Shop details ▾" section of property rows. */
export function PropertySection({ title, children, defaultOpen = true, action }: { title: string; children: React.ReactNode; defaultOpen?: boolean; action?: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-line px-5 py-4 last:border-b-0">
      <div className="mb-2 flex items-center">
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-[14px] font-medium text-ink">
          {title}<ChevronDownIcon className={cn("size-3.5 text-ink-3 transition-transform", !open && "-rotate-90")} />
        </button>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {open && <dl className="flex flex-col">{children}</dl>}
    </div>
  );
}

export function Property({ icon: I, label, children, empty = "No value" }: { icon?: Icon; label: string; children?: React.ReactNode; empty?: string }) {
  const isEmpty = children === undefined || children === null || children === "" || children === false;
  return (
    <div className="flex min-h-9 items-start gap-2 py-[7px]">
      <dt className="flex w-[150px] shrink-0 items-center gap-2 text-[14px] text-ink-2">
        {I && <I className="size-4 shrink-0 text-ink-3" strokeWidth={1.6} />}
        <span className="truncate">{label}</span>
      </dt>
      <dd className={cn("min-w-0 flex-1 text-[14px]", isEmpty ? "text-ink-3" : "text-ink")}>{isEmpty ? empty : children}</dd>
    </div>
  );
}

export interface RecordTab { value: string; label: string; icon?: Icon; count?: number }
/** URL-synced tabs (?tab=). Active = ink underline + soft pill, Attio-style. */
export function RecordTabs({ tabs, param = "tab" }: { tabs: RecordTab[]; param?: string }) {
  const sp = useSearchParams(); const router = useRouter(); const pathname = usePathname();
  const cur = sp.get(param) ?? tabs[0].value;
  return (
    <div className="sticky top-0 z-10 flex h-12 shrink-0 items-end gap-1 overflow-x-auto border-b border-line bg-white px-4 scrollbar-none">
      {tabs.map((t) => {
        const active = cur === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => { const q = new URLSearchParams(sp.toString()); q.set(param, t.value); router.replace(`${pathname}?${q}`, { scroll: false }); }}
            className={cn(
              "relative mb-1.5 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[14px] transition-colors",
              active ? "bg-active font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
            )}
          >
            {t.icon && <t.icon className="size-4" strokeWidth={1.6} />}
            {t.label}
            {t.count !== undefined && <CountBadge n={t.count} />}
            {active && <span className="absolute -bottom-1.5 left-2 right-2 h-0.5 rounded-full bg-ink" />}
          </button>
        );
      })}
    </div>
  );
}
export function useTab(defaultTab: string, param = "tab") {
  return useSearchParams().get(param) ?? defaultTab;
}

/** Highlights grid (3 columns): small bordered cards with label, icon and a value. */
export function Highlights({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}
export function Highlight({ label, icon: I, children, sub, tone }: { label: string; icon?: Icon; children: React.ReactNode; sub?: React.ReactNode; tone?: "danger" | "warn" | "gold" }) {
  return (
    <div className="flex min-h-[84px] flex-col rounded-[10px] border border-line px-3.5 py-3">
      <div className="flex items-center justify-between text-[13px] text-ink-2">
        <span className="truncate">{label}</span>
        {I && <I className="size-4 shrink-0 text-ink-3" strokeWidth={1.6} />}
      </div>
      <div className={cn("mt-auto pt-2 text-[15px] font-medium text-ink", tone === "danger" && "text-danger", tone === "warn" && "text-warn", tone === "gold" && "text-gold-ink")}>{children}</div>
      {sub && <div className="mt-0.5 truncate text-[12.5px] text-ink-3">{sub}</div>}
    </div>
  );
}

/** Bordered list card used for Orders / Memos / Notes sections on record pages. */
export function ListCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-line overflow-hidden rounded-[10px] border border-line", className)}>{children}</div>;
}
export function ListRow({ children, onClick, href, className }: { children: React.ReactNode; onClick?: () => void; href?: string; className?: string }) {
  const cls = cn("flex min-h-10 items-center gap-3 px-3.5 py-2 text-[14px]", (onClick || href) && "cursor-pointer hover:bg-hover", className);
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <div className={cls} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}>{children}</div>;
}

export function MainSection({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-6 py-5">
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="text-[15px] font-medium text-ink">{title}</h2>
        {count !== undefined && <span className="num text-[13px] text-ink-3">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}
