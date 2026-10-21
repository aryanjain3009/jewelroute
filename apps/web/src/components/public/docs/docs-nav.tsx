"use client";
/** /developers navigation. Desktop (≥1024): a sticky, independently scrolling left sidebar with
 *  grouped links and scroll-spy (Stripe docs pattern). Phones and tablets: a sticky "On this page"
 *  bar under the site header that opens the same list in a popover (Radix, origin-aware).
 *  The active item is a colour change only — nothing moves while you scroll. */
import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DocsGroup { title: string; items: { id: string; label: string }[] }

function useActive(ids: string[]) {
  const [active, setActive] = React.useState(ids[0]);
  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      let cur = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - 140 <= 0) cur = id;
      }
      // At the very bottom the last short sections can never reach the top: pick the last one.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = ids[ids.length - 1];
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [ids]);
  return [active, setActive] as const;
}

function List({ groups, active, onPick, className }: { groups: DocsGroup[]; active: string; onPick: (id: string) => void; className?: string }) {
  return (
    <div className={className}>
      {groups.map((g) => (
        <div key={g.title} className="mt-6 first:mt-0">
          <div className="mb-1 px-2.5 text-[12.5px] font-medium text-ink-3">{g.title}</div>
          <ul className="flex flex-col gap-px">
            {g.items.map((it) => {
              const on = it.id === active;
              return (
                <li key={it.id}>
                  <a
                    href={`#${it.id}`}
                    onClick={() => onPick(it.id)}
                    aria-current={on ? "location" : undefined}
                    className={cn(
                      "flex min-h-8 items-center rounded-[7px] px-2.5 py-1 text-[14px] leading-snug transition-colors duration-150 ease-out outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30",
                      on ? "bg-active font-medium text-ink" : "text-ink-2 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-hover [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink",
                    )}
                  >
                    {it.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DocsNav({ groups, footer }: { groups: DocsGroup[]; footer?: React.ReactNode }) {
  const ids = React.useMemo(() => groups.flatMap((g) => g.items.map((i) => i.id)), [groups]);
  const [active, setActive] = useActive(ids);
  const [open, setOpen] = React.useState(false);
  const label = groups.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? "";
  return (
    <>
      {/* Desktop sidebar */}
      <aside aria-label="Developer docs" className="hidden border-r border-line lg:block">
        <nav className="sticky top-16 flex h-[calc(100dvh-4rem)] flex-col overflow-y-auto overscroll-contain px-4 pt-8 pb-6">
          <List groups={groups} active={active} onPick={setActive} />
          {footer && <div className="mt-auto pt-8">{footer}</div>}
        </nav>
      </aside>

      {/* Phones and tablets */}
      <div className="sticky top-16 z-30 border-b border-line bg-white lg:hidden">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="flex h-12 w-full items-center gap-2 px-5 text-left text-[14px] outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-blue/30 sm:px-8">
            <span className="text-ink-3">On this page</span>
            <span className="min-w-0 truncate font-medium text-ink">{label}</span>
            <ChevronDownIcon className={cn("ml-auto size-4 shrink-0 text-ink-2 transition-transform duration-200 ease-out", open && "rotate-180")} />
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={0} className="max-h-[min(70dvh,560px)] w-[min(calc(100vw-24px),360px)] overflow-y-auto rounded-[12px] border border-line p-2 shadow-[0_12px_40px_-12px_rgb(28_29_31/0.25)] ring-0">
            <List groups={groups} active={active} onPick={(id) => { setActive(id); setOpen(false); }} className="py-1" />
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
