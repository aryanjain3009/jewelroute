"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { TAB_BAR_H } from "./shell";

/** Compact sticky top bar: optional back link, 17px title, right-hand slot. */
export function PageBar({ title, back, backLabel, right, sub }: { title: React.ReactNode; back?: string | (() => void); backLabel?: string; right?: React.ReactNode; sub?: React.ReactNode }) {
  const backCls = "-ml-2 inline-flex h-11 shrink-0 items-center gap-0.5 rounded-lg pl-1 pr-2 text-[15px] text-ink-2 hover:text-ink";
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <div className="flex h-12 items-center gap-1 px-4">
        {typeof back === "string" && <Link href={back} className={backCls} aria-label={backLabel ? `Back to ${backLabel}` : "Back"}><ChevronLeft className="size-5" />{backLabel && <span className="max-[359px]:sr-only">{backLabel}</span>}</Link>}
        {typeof back === "function" && <button type="button" onClick={back} className={backCls} aria-label={backLabel ? `Back to ${backLabel}` : "Back"}><ChevronLeft className="size-5" />{backLabel && <span className="max-[359px]:sr-only">{backLabel}</span>}</button>}
        <h1 className={cn("min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em] text-ink", back && "text-center")}>{title}</h1>
        <div className={cn("flex shrink-0 items-center justify-end gap-1", back && "min-w-[72px]")}>{right}</div>
      </div>
      {sub}
    </header>
  );
}

/** Sticky bottom action area. `aboveTabs` lifts it over the tab bar on root tabs. Always render a spacer
 *  of the same height in the page (`BottomSpacer`) so content can scroll clear of it. */
export function BottomBar({ children, aboveTabs, className }: { children: React.ReactNode; aboveTabs?: boolean; className?: string }) {
  return (
    <div className="fixed inset-x-0 z-30" style={{ bottom: aboveTabs ? TAB_BAR_H : 0 }}>
      <div className={cn("mx-auto max-w-[520px] border-t border-line bg-paper px-4 pt-3 min-[521px]:border-x", aboveTabs ? "pb-3" : "safe-bottom", className)}>
        {children}
      </div>
    </div>
  );
}
export const BottomSpacer = ({ h = 96 }: { h?: number }) => <div aria-hidden style={{ height: h }} className="shrink-0" />;
