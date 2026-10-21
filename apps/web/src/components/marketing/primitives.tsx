/** Landing primitives measured from the Attio reference (docs/LANDING.md, "v4 — Attio landing reference"):
 *  a 1392 px rail container with hairline sides, 56 px content inset, two-tone 40/44 headings,
 *  36 px buttons with radius 10, flat stages and white product cards. Server-safe. */
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Rail container: the page lives between two hairlines 24 px in from the viewport edge (≥1024). */
export const RAIL = "mx-auto w-full max-w-[1392px] lg:border-x lg:border-line";
/** Content inset inside the rails. */
export const INSET = "px-5 sm:px-8 lg:px-14";

/** Buttons: shadcn `buttonVariants` re-tuned to the landing scale. Press = scale(.97) in 160 ms
 *  (emil-design-eng), colour changes are plain `ease`, and only transform/colour transition. */
export const cta = cva(
  "h-9 rounded-[10px] px-3.5 text-[14px] font-medium transition-[scale,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] active:not-aria-[haspopup]:translate-y-0 focus-visible:ring-[3px] focus-visible:ring-blue/30 focus-visible:border-blue",
  {
    variants: {
      tone: {
        primary: "bg-ink text-white hover:bg-[#2c2d30]",
        secondary: "border-line-strong bg-white text-ink hover:bg-hover",
        ghost: "text-ink-2 hover:bg-hover hover:text-ink",
      },
      size: { md: "", sm: "h-8 rounded-[9px] px-3 text-[13px]" },
    },
    defaultVariants: { tone: "primary", size: "md" },
  },
);

export function CtaLink({ href, tone, size, className, children, ...rest }: { href: string; className?: string; children: React.ReactNode } & VariantProps<typeof cta> & Omit<React.ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: tone === "primary" || !tone ? "default" : tone === "ghost" ? "ghost" : "outline" }), cta({ tone, size }), className)} {...rest}>
      {children}
    </Link>
  );
}

/** A full-rail section. Every section starts on a hairline, like the reference. */
export function Section({ id, labelledBy, className, children }: { id?: string; labelledBy?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("scroll-mt-16 border-t border-line", className)}>
      <div className={RAIL}>{children}</div>
    </section>
  );
}

/** Small section label (sentence case, no pill). */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[14px] font-medium text-ink-2", className)}>{children}</p>;
}

/** Two-tone heading: the claim in ink, the explanation continuing in grey (40/44, 500, −0.01em). */
export function Heading({ id, lead, rest, as: H = "h2", size = "lg", className }: { id?: string; lead: React.ReactNode; rest?: React.ReactNode; as?: "h2" | "h3"; size?: "xl" | "lg" | "md"; className?: string }) {
  return (
    <H
      id={id}
      className={cn(
        "text-balance font-medium text-ink",
        size === "xl" && "text-[34px] leading-[1.06] tracking-[-0.022em] sm:text-[44px] lg:text-[52px]",
        size === "lg" && "text-[28px] leading-[1.12] tracking-[-0.016em] sm:text-[34px] lg:text-[40px] lg:leading-[1.1]",
        size === "md" && "text-[20px] leading-[1.18] tracking-[-0.01em] sm:text-[24px] sm:leading-[1.15]",
        className,
      )}
    >
      {lead}
      {rest && <> <span className="text-ink-2">{rest}</span></>}
    </H>
  );
}

/** Flat grey stage that holds product UI (no shadow, no gradient). */
export function Stage({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("bg-sunken", className)}>{children}</div>;
}

/** White product card inside a stage: hairline, radius 12, no resting shadow. */
export function Card({ className, children, label }: { className?: string; children: React.ReactNode; label?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[12px] border border-line bg-white", className)}>
      {label && <div className="flex h-9 items-center border-b border-line px-3 text-[12.5px] font-medium text-ink-2">{label}</div>}
      {children}
    </div>
  );
}

/** App window: neutral title bar with three dots and a "Sample data" marker, app body below. */
export function AppWindow({ title, children, className, bodyClassName }: { title: string; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[14px] border border-line-strong bg-[#f4f4f5]", className)}>
      <div className="flex h-9 items-center gap-3 px-3.5">
        <span className="flex gap-1.5" aria-hidden><span className="size-2.5 rounded-full bg-[#dcdcde]" /><span className="size-2.5 rounded-full bg-[#dcdcde]" /><span className="size-2.5 rounded-full bg-[#dcdcde]" /></span>
        <span className="min-w-0 flex-1 truncate text-center text-[12px] text-ink-3">{title}</span>
        <SampleTag />
      </div>
      <div className={cn("mx-1.5 mb-1.5 overflow-hidden rounded-[10px] border border-line bg-white", bodyClassName)}>{children}</div>
    </div>
  );
}

/** The honesty marker on every product frame: small, neutral, never a CTA. */
export function SampleTag({ className }: { className?: string }) {
  return <span className={cn("inline-flex h-5 shrink-0 items-center rounded-[5px] border border-line-strong bg-white px-1.5 text-[11px] font-medium text-ink-3", className)}>Sample data</span>;
}

/** A hairline arrow between two fragments in a flow (horizontal ≥ xl, vertical below). */
export function FlowArrow({ className }: { className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center text-ink-3 max-xl:h-6 xl:w-6", className)} aria-hidden>
      <svg viewBox="0 0 16 16" className="size-4 max-xl:rotate-90"><path d="M2 8h11M9.5 4.5 13 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}
