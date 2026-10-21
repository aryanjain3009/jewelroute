"use client";
/** Field app shell: one phone-width column (centred on tablets and desktops) + a bottom tab bar.
 *  Pushed screens (a visit and its sale flow) hide the tab bar so their own primary action
 *  owns the bottom of the screen, the way iOS hides the tab bar on pushed views. */
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CircleUserRound, Gem, History, Route } from "lucide-react";
import { useMe } from "@/lib/session";
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
  const router = useRouter();
  const me = useMe();
  // The middleware routes by the access token; this covers a session that only had a refresh cookie.
  const wrongRole = !!me.data && me.data.role !== "FIELD_AGENT";
  useEffect(() => { if (wrongRole) router.replace("/admin"); }, [wrongRole, router]);
  const pushed = /^\/field\/visits\/[^/]+/.test(path);
  return (
    <div className="min-h-dvh bg-sunken text-[15px] text-ink [-webkit-tap-highlight-color:transparent]">
      <div className="relative mx-auto flex min-h-dvh max-w-[520px] flex-col bg-paper min-[521px]:border-x min-[521px]:border-line">
        {wrongRole ? null : children}
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
              className={cn("group flex h-14 flex-col items-center justify-center gap-[3px] text-[11px] tracking-[0.01em] transition-colors duration-150",
                active ? "font-semibold text-ink" : "font-medium text-ink-3 hover:text-ink-2")}>
              <I className="size-[22px] transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-active:scale-90" strokeWidth={active ? 2.1 : 1.7} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
