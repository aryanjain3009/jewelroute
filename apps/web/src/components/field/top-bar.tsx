"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { TAB_BAR_H } from "./shell";

/** Compact sticky top bar: optional back link, 17px title (with an optional one-line subtitle, the iOS
 *  navigation-subtitle pattern), right-hand slot, and an optional row under it (`sub`). */
export function PageBar({ title, subtitle, back, backLabel, right, sub }: {
  title: React.ReactNode; subtitle?: React.ReactNode; back?: string | (() => void); backLabel?: string; right?: React.ReactNode; sub?: React.ReactNode;
}) {
  const backCls = "-ml-2 inline-flex h-11 shrink-0 items-center gap-0.5 rounded-lg pl-1 pr-2 text-[15px] text-ink-2 transition-[color,opacity] duration-150 hover:text-ink active:opacity-60";
  const backInner = <><ChevronLeft className="size-5" strokeWidth={2} />{backLabel && <span className="max-w-[88px] truncate max-[359px]:sr-only">{backLabel}</span>}</>;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <div className="flex h-12 items-center gap-1 px-4">
        {typeof back === "string" && <Link href={back} className={backCls} aria-label={backLabel ? `Back to ${backLabel}` : "Back"}>{backInner}</Link>}
        {typeof back === "function" && <button type="button" onClick={back} className={backCls} aria-label={backLabel ? `Back to ${backLabel}` : "Back"}>{backInner}</button>}
        <div className={cn("min-w-0 flex-1", back && "text-center")}>
          <h1 className={cn("truncate font-semibold tracking-[-0.01em] text-ink", subtitle ? "text-[15px] leading-tight" : "text-[17px]")}>{title}</h1>
          {subtitle && <p className="truncate text-[12px] leading-tight text-ink-3">{subtitle}</p>}
        </div>
        <div className={cn("flex shrink-0 items-center justify-end gap-1", back && "min-w-[72px]")}>{right}</div>
      </div>
      {sub}
    </header>
  );
}

/** Sticky bottom action area (the thumb zone). `aboveTabs` lifts it over the tab bar on root tabs; `enter`
 *  slides it up once when it first appears in response to an action (the cart's first item). Always
 *  render a spacer of the same height in the page (`BottomSpacer`) so content can scroll clear of it. */
export function BottomBar({ children, aboveTabs, className, enter }: { children: React.ReactNode; aboveTabs?: boolean; className?: string; enter?: boolean }) {
  // Publishes how far the bar's top edge sits above the viewport bottom (`--jr-bar-top`), so field toasts
  // land just above whatever owns the bottom of the screen (see components/ui/sonner.tsx).
  const bar = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = bar.current; if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--jr-bar-top", `${Math.max(0, Math.round(window.innerHeight - el.getBoundingClientRect().top))}px`);
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    window.addEventListener("resize", set);
    el.addEventListener("transitionend", set); // the `enter` slide-up moves the top edge without resizing
    return () => { ro.disconnect(); window.removeEventListener("resize", set); el.removeEventListener("transitionend", set); root.style.removeProperty("--jr-bar-top"); };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 z-30" style={{ bottom: aboveTabs ? TAB_BAR_H : 0 }}>
      <div ref={bar} className={cn("pointer-events-auto mx-auto max-w-[520px] border-t border-line bg-paper px-4 pt-3 min-[521px]:border-x", aboveTabs ? "pb-3" : "safe-bottom",
        enter && "transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] starting:translate-y-full", className)}>
        {children}
      </div>
    </div>
  );
}
export const BottomSpacer = ({ h = 96 }: { h?: number }) => <div aria-hidden style={{ height: h }} className="shrink-0" />;
