"use client";
/**
 * Origin UI navbar (coss.com/origin, comp-577), installed with
 * `pnpm dlx shadcn@latest add https://coss.com/origin/r/comp-577.json` and adapted:
 * - links and actions come from props (no placeholder "#"), rendered through next/link;
 * - the mobile trigger sits on the right and closes the popover when a link is chosen;
 * - the hamburger morph runs 200 ms on a strong ease-out (emil-design-eng: < 300 ms, no overshoot);
 * - JewelRoute tokens (ink, hairlines, radius 10) instead of the default shadcn look.
 */
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList } from "@/components/ui/navigation-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface NavbarLink { href: string; label: string; active?: boolean }

export function Navbar({ logo, links, actions, mobileActions, className, innerClassName }: {
  logo: React.ReactNode;
  links: NavbarLink[];
  actions: React.ReactNode;
  /** Actions repeated at the foot of the mobile menu. */
  mobileActions?: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <header className={cn("sticky top-0 z-40 border-b border-line bg-white", className)}>
      <div className={cn("flex h-16 items-center justify-between gap-4", innerClassName)}>
        {/* Left side: logo + main nav */}
        <div className="flex items-center gap-8">
          {logo}
          <NavigationMenu viewport={false} className="max-lg:hidden">
            <NavigationMenuList className="gap-0.5">
              {links.map((link) => (
                <NavigationMenuItem key={link.label}>
                  <NavigationMenuLink asChild active={link.active}>
                    <Link
                      href={link.href}
                      aria-current={link.active ? "page" : undefined}
                      className="h-9 justify-center rounded-[10px] px-3 py-0 text-[15px] font-medium text-[#3b3c40] transition-colors duration-150 hover:bg-hover hover:text-ink focus:bg-transparent focus-visible:bg-hover focus-visible:ring-[3px] focus-visible:ring-blue/30 data-active:bg-transparent data-active:text-ink"
                    >
                      {link.label}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* Right side: actions (desktop) / menu trigger (mobile) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 max-lg:hidden">{actions}</div>
          {/* Scrim under the full-width menu sheet: the page behind reads as inactive. */}
          <div aria-hidden onClick={() => setOpen(false)} className={cn("fixed inset-x-0 top-16 bottom-0 z-30 bg-[rgb(28_29_31/0.18)] transition-opacity duration-200 ease-out lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")} />
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button className="group -mr-1.5 size-11 rounded-[10px] lg:hidden" size="icon" variant="ghost" aria-label={open ? "Close menu" : "Open menu"}>
                <svg className="pointer-events-none" fill="none" height={18} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={18} aria-hidden>
                  <path className="-translate-y-[6px] origin-center transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-aria-expanded:translate-x-0 group-aria-expanded:translate-y-0 group-aria-expanded:rotate-[315deg]" d="M4 12L20 12" />
                  <path className="origin-center transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-aria-expanded:rotate-45" d="M4 12H20" />
                  <path className="origin-center translate-y-[6px] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-aria-expanded:translate-y-0 group-aria-expanded:rotate-[135deg]" d="M4 12H20" />
                </svg>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={10} collisionPadding={0} className="w-screen max-w-none gap-0 rounded-none border-0 border-b border-line bg-white px-3 pt-2 pb-4 shadow-[0_16px_32px_-16px_rgb(28_29_31/0.2)] ring-0 data-open:zoom-in-100 data-closed:zoom-out-100 lg:hidden">
              <nav aria-label="Main">
                <ul className="flex flex-col">
                  {links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        aria-current={link.active ? "page" : undefined}
                        className="flex h-11 items-center rounded-[8px] px-3 text-[15px] font-medium text-ink transition-colors duration-150 hover:bg-hover focus-visible:bg-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              {mobileActions && <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line px-1 pt-4 [&_a]:h-11" onClick={() => setOpen(false)}>{mobileActions}</div>}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
