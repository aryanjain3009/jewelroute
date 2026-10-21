"use client";
/** The shell's navigation controls, handed to page headers (TitleBar, record breadcrumb) so phones and
 *  tablets get ONE header row: the page's own, with the sidebar toggle at its start. */
import * as React from "react";
import { PanelLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ShellNavValue { open: () => void; collapsed: boolean }
export const ShellNav = React.createContext<ShellNavValue | null>(null);

/** Sidebar toggle for a page header: visible below lg (opens the drawer), and on desktop only while the
 *  sidebar is collapsed (brings it back). Renders nothing outside the admin shell. */
export function NavToggle({ className }: { className?: string }) {
  const nav = React.useContext(ShellNav);
  if (!nav) return null;
  return (
    <button
      type="button"
      aria-label={nav.collapsed ? "Show sidebar" : "Open navigation"}
      onClick={nav.open}
      className={cn("press -ml-1.5 grid size-8 shrink-0 place-items-center rounded-md text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-blue/35", !nav.collapsed && "lg:hidden", className)}
    >
      <PanelLeftIcon className="size-4" strokeWidth={1.75} />
    </button>
  );
}
