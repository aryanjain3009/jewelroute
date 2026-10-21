"use client";
/** Field app shell: one phone-width column (centred on desktop) + a bottom tab bar.
 *  Pushed screens (a visit and its sale flow) hide the tab bar so their own primary action
 *  owns the bottom of the screen, the way iOS hides the tab bar on pushed views. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, Gem, History, Route } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/field/today", label: "Today", icon: Route },
  { href: "/field/visits", label: "Visits", icon: History },
  { href: "/field/catalog", label: "Catalog", icon: Gem },
  { href: "/field/profile", label: "Profile", icon: CircleUserRound },
] as const;

export const TAB_BAR_H = "calc(56px + env(safe-area-inset-bottom))";

export function FieldShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const pushed = /^\/field\/visits\/[^/]+/.test(path);
  return (
    <div className="min-h-dvh bg-sunken text-[15px] text-ink">
      <div className="relative mx-auto flex min-h-dvh max-w-[520px] flex-col bg-paper min-[521px]:border-x min-[521px]:border-line">
        {children}
        {!pushed && <div aria-hidden style={{ height: TAB_BAR_H }} className="shrink-0" />}
      </div>
      {!pushed && <TabBar path={path} />}
    </div>
  );
}

function TabBar({ path }: { path: string }) {
  return (
    <nav aria-label="Field" className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto grid max-w-[520px] grid-cols-4 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] min-[521px]:border-x">
        {TABS.map(({ href, label, icon: I }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[11px] transition-colors", active ? "font-semibold text-ink" : "font-medium text-ink-3 hover:text-ink-2")}>
              <I className="size-[22px]" strokeWidth={active ? 2.1 : 1.7} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
