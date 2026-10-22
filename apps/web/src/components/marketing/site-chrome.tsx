/** Header and footer shared by the landing page and /developers. Header = Origin navbar (comp-577),
 *  footer = the reference's link-column footer, light, inside the same rails. Every link resolves. */
import Link from "next/link";
import { Logo } from "@/components/jr/logo";
import { Navbar } from "@/components/ui/origin/navbar";
import { cn } from "@/lib/utils";
import { CtaLink, RAIL } from "./primitives";

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/#visit", label: "Visits" },
  { href: "/#custody", label: "Custody" },
  { href: "/#workflow", label: "Workflow" },
  { href: "/developers", label: "Developers" },
];

export function SiteHeader({ current }: { current?: "developers" }) {
  return (
    <Navbar
      innerClassName={cn(RAIL, "px-4 sm:px-6 lg:border-x-0")}
      logo={<Link href="/" aria-label="JewelRoute home" className="-m-1 shrink-0 rounded-[8px] p-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30"><Logo /></Link>}
      links={NAV.map((l) => ({ ...l, active: current === "developers" && l.href === "/developers" }))}
      actions={<>
        <CtaLink href="/login" tone="secondary">Sign in</CtaLink>
        <CtaLink href="/login">Explore live demo</CtaLink>
      </>}
      mobileActions={<>
        <CtaLink href="/login" tone="secondary" className="w-full">Sign in</CtaLink>
        <CtaLink href="/signup" tone="secondary" className="order-last col-span-full w-full">Create your workspace</CtaLink>
        <CtaLink href="/login" className="w-full">Explore live demo</CtaLink>
      </>}
    />
  );
}

const COLS: { title: string; links: [string, string][] }[] = [
  { title: "Product", links: [["/#product-route", "Route and bag"], ["/#product-selling", "Selling at today's rate"], ["/#product-memos", "Memos"], ["/#manager", "Manager operations"]] },
  { title: "Field", links: [["/#visit", "Verified visits"], ["/#custody", "Sample custody"], ["/#workflow", "One field day"], ["/#trust", "Trust and audit"]] },
  { title: "Developers", links: [["/developers", "API overview"], ["/developers#events", "Event catalogue"], ["/developers#signatures", "Verifying signatures"], ["/developers#money", "Money in paise"]] },
  { title: "Account", links: [["/login", "Sign in"], ["/signup", "Create a workspace"], ["/login", "Explore live demo"]] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className={cn(RAIL, "grid gap-10 px-5 pt-14 pb-10 sm:px-8 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] md:gap-8 lg:px-14")}>
        <div>
          <Link href="/" aria-label="JewelRoute home" className="-m-1 inline-flex rounded-[8px] p-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30"><Logo /></Link>
          <p className="mt-3 max-w-[30ch] text-[14px] leading-relaxed text-ink-2">The field sales operating system for jewellery manufacturers and wholesalers.</p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4 md:contents">
          {COLS.map((c) => (
            <nav key={c.title} aria-label={c.title} className="text-[14px]">
              <h2 className="text-[13px] font-medium text-ink-3">{c.title}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {c.links.map(([href, label]) => (
                  <li key={label}><Link href={href} className="rounded-[4px] text-ink-2 transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30">{label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className={cn(RAIL, "flex flex-col gap-2 border-t border-line px-5 py-5 text-[12.5px] text-ink-3 sm:flex-row sm:justify-between sm:px-8 lg:px-14")}>
        <p>Product screens on this page show sample data from a demo workspace, not live figures.</p>
        <p>Catalogue photos: Unsplash.</p>
      </div>
    </footer>
  );
}
