"use client";
/**
 * Origin UI vertical tabs (coss.com/origin, comp-444), installed with
 * `pnpm dlx shadcn@latest add https://coss.com/origin/r/comp-444.json` and adapted into an in-page
 * section index: the same trigger anatomy (full-width row, 2 px indicator on the start edge, quiet
 * hover) but rendered as anchor links with `aria-current`, driven by scroll position instead of a
 * tab state, because every section stays on the page (nothing is hidden behind a tab).
 * The indicator is a colour change only — no movement, so nothing to reduce for reduced motion.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionNavItem { id: string; label: string }

export function SectionNav({ items, className, offset = 160 }: { items: SectionNavItem[]; className?: string; offset?: number }) {
  const [active, setActive] = React.useState(items[0]?.id);

  React.useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      let cur = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top - offset <= 0) cur = el.id;
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [items, offset]);

  return (
    <nav aria-label="Product sections" className={className}>
      <ul className="flex flex-col gap-1">
        {items.map((it) => {
          const on = it.id === active;
          return (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "relative flex h-8 w-full items-center rounded-[8px] px-3 text-[15px] font-medium transition-colors duration-150 ease-out",
                  "after:absolute after:inset-y-1.5 after:-start-[1px] after:w-0.5 after:rounded-full after:transition-colors after:duration-150",
                  "hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30",
                  on ? "text-ink after:bg-ink" : "text-ink-3 after:bg-transparent",
                )}
              >
                {it.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
