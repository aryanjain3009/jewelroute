"use client";
/** Attio-style application shell for /admin: 240px sidebar (workspace switcher, ⌘K search,
 *  sections), full-bleed main panel. Pages render their own TitleBar/ViewBar/FilterBar. */
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BoxesIcon, ChevronDownIcon, CodeXmlIcon, GemIcon, HomeIcon, LogOutIcon, MapPinnedIcon, PanelLeftIcon,
  ReceiptTextIcon, ScrollTextIcon, SearchIcon, Settings2Icon, SmartphoneIcon, StoreIcon, UsersIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatRate } from "@jewelroute/shared";
import { api } from "@/lib/api";
import { qk } from "@/lib/sync";
import { useMe, logout } from "@/lib/session";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, Kbd } from "./chrome";
import { CommandMenu, useCommandMenu } from "./command-menu";
import { ShellNav } from "./nav-context";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;
type NavItem = { href: string; label: string; icon: Icon; exact?: boolean; tint: string };
type NavGroup = { label?: string; items: NavItem[] };

/** Object colours (Attio gives each object a small coloured square icon). */
export const OBJECT_TINT = {
  home: "bg-[#6e6f73]", visits: "bg-[#2f6bf2]", agents: "bg-[#7a5af5]", shops: "bg-[#0f9f8f]",
  orders: "bg-[#e5732b]", memos: "bg-[#b08a35]", samples: "bg-[#c2410c]", catalog: "bg-[#d1477a]",
  integrations: "bg-[#1c1d1f]", settings: "bg-[#6e6f73]",
} as const;

export const ADMIN_NAV: NavGroup[] = [
  { items: [{ href: "/admin", label: "Home", icon: HomeIcon, exact: true, tint: OBJECT_TINT.home }] },
  { label: "Field", items: [
    { href: "/admin/visits", label: "Visits", icon: MapPinnedIcon, tint: OBJECT_TINT.visits },
    { href: "/admin/agents", label: "Agents", icon: UsersIcon, tint: OBJECT_TINT.agents },
    { href: "/admin/shops", label: "Shops", icon: StoreIcon, tint: OBJECT_TINT.shops },
  ] },
  { label: "Sales", items: [
    { href: "/admin/orders", label: "Orders", icon: ReceiptTextIcon, tint: OBJECT_TINT.orders },
    { href: "/admin/memos", label: "Memos", icon: ScrollTextIcon, tint: OBJECT_TINT.memos },
    { href: "/admin/samples", label: "Samples", icon: GemIcon, tint: OBJECT_TINT.samples },
  ] },
  { label: "Workspace", items: [
    { href: "/admin/catalog", label: "Catalog", icon: BoxesIcon, tint: OBJECT_TINT.catalog },
    { href: "/admin/settings", label: "Settings", icon: Settings2Icon, tint: OBJECT_TINT.settings },
  ] },
];

function useRates(enabled: boolean) {
  // "22K today" must not go stale in a tab opened before a rate change: poll every 60 s and always
  // refetch on focus. A rate set in THIS tab invalidates qk.goldRates via sync's "gold_rate.set".
  return useQuery({ queryKey: qk.goldRates, queryFn: () => api<{ current: { purity: string; ratePaisePerGram: number }[] }>("/admin/gold-rates"), refetchInterval: 60_000, refetchOnWindowFocus: "always", enabled });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const me = useMe();
  const cmd = useCommandMenu();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const wrongRole = !!me.data && me.data.role !== "ADMIN";
  React.useEffect(() => { if (wrongRole) router.replace("/field/today"); }, [wrongRole, router]);
  React.useEffect(() => setMobileOpen(false), [path]);
  const isActive = (n: NavItem) => (n.exact ? path === n.href : path === n.href || path.startsWith(n.href + "/"));
  const rates = useRates(!wrongRole);
  const r22 = rates.data?.current.find((r) => r.purity === "K22");

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar-bg">
      {/* Workspace switcher */}
      <div className="flex h-[52px] shrink-0 items-center gap-2 px-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-blue/30">
            <span className="grid size-6 shrink-0 place-items-center rounded-[6px] bg-ink text-[11px] font-semibold text-white">{(me.data?.tenant.name ?? "A")[0]}</span>
            <span className="truncate text-[14px] font-semibold text-ink">{me.data?.tenant.name ?? "Aurum Jewels"}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-ink-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="text-[13px] font-medium text-ink">{me.data?.name}</div>
              <div className="text-xs text-ink-3">{me.data?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/field"><SmartphoneIcon />Open field app</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/developers"><CodeXmlIcon />API docs</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/admin/settings"><Settings2Icon />Workspace settings</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()}><LogOutIcon />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" aria-label="Collapse sidebar" onClick={() => setCollapsed(true)} className="hidden size-7 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink lg:grid">
          <PanelLeftIcon className="size-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <button type="button" onClick={() => { setMobileOpen(false); cmd.setOpen(true); }} className="flex h-8 w-full items-center gap-2 rounded-lg border border-line-strong bg-white px-2.5 text-[14px] text-ink-3 shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-colors hover:border-[#d9d9db] hover:text-ink-2">
          <SearchIcon className="size-4" />Search<span className="ml-auto"><Kbd>⌘K</Kbd></span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {ADMIN_NAV.map((g, gi) => (
          <div key={gi} className={cn(g.label && "mt-4")}>
            {g.label && <div className="mb-1 px-2 text-[13px] text-ink-3">{g.label}</div>}
            <div className="flex flex-col gap-px">
              {g.items.map((n) => {
                const act = isActive(n);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={cn("flex h-[30px] items-center gap-2 rounded-md px-2 text-[14px] transition-colors", act ? "bg-active font-medium text-ink" : "text-ink hover:bg-hover")}
                  >
                    <span className={cn("grid size-[18px] place-items-center rounded-[5px] text-white", n.tint)}>
                      <n.icon className="size-3" strokeWidth={2.2} />
                    </span>
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: live 22K rate + user */}
      <div className="border-t border-line px-3 py-2.5">
        {r22 && (
          <Link href="/admin/settings?tab=gold-rate" className="mb-1 flex h-[30px] items-center gap-2 rounded-md px-2 text-[13px] text-ink-2 hover:bg-hover">
            <span className="size-2 rounded-full bg-gold" />22K today<span className="num ml-auto font-medium text-gold-ink">{formatRate(r22.ratePaisePerGram)}</span>
          </Link>
        )}
        <div className="flex h-[30px] items-center gap-2 px-2 text-[13px] text-ink-2">
          <Avatar name={me.data?.name ?? "?"} size={20} />
          <span className="truncate">{me.data?.name}</span>
        </div>
      </div>
    </div>
  );

  return (
    <ShellNav.Provider value={{ open: () => (collapsed ? setCollapsed(false) : setMobileOpen(true)), collapsed }}>
      <div className="flex h-dvh overflow-hidden bg-white text-ink">
        {!collapsed && <aside className="hidden w-[240px] shrink-0 border-r border-line lg:block">{sidebar}</aside>}
        {/* Phones and tablets: the sidebar is a left sheet (Radix dialog: focus trap, Esc, scrim). */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" showCloseButton={false} className="w-[264px] max-w-[85vw] gap-0 border-r border-line p-0 data-[side=left]:w-[264px] data-[side=left]:sm:max-w-[264px]">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Move between Home, field, sales and workspace pages.</SheetDescription>
            {sidebar}
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{wrongRole ? null : children}</main>
        </div>
        <CommandMenu {...cmd} />
      </div>
    </ShellNav.Provider>
  );
}
