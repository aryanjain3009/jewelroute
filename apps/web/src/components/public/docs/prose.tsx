/** Prose primitives for /developers (server-safe). Reference: Stripe's API reference — a prose column
 *  on the left (15 px / 1.65, dark slate, 60–68ch) and a sticky code column on the right at ≥ 1280 px,
 *  sections separated by full-width hairlines, 24 px section titles. */
import { cn } from "@/lib/utils";

export const MONO = "font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace]";
/** Body colour for long-form reading: darker than ink-2 for comfort, still clearly secondary to headings. */
export const PROSE = "text-[15px] leading-[1.65] text-[#45464b]";

export function C({ children }: { children: React.ReactNode }) {
  return <code className={cn("rounded-[5px] border border-line bg-sunken px-[5px] py-px text-[0.86em] whitespace-nowrap text-ink", MONO)}>{children}</code>;
}

export function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn(PROSE, "mt-4 first:mt-0", className)}>{children}</p>;
}

export function Ul({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn(PROSE, "mt-4 space-y-2.5", className)}>{children}</ul>;
}
export function Li({ children }: { children: React.ReactNode }) {
  return <li className="flex gap-3"><span className="mt-[11px] h-px w-2.5 shrink-0 bg-ink-3" aria-hidden /><span className="min-w-0">{children}</span></li>;
}

export function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-ink">{children}</strong>;
}

/** A documentation section: title + prose on the left, code (sticky) on the right at xl. */
export function DocSection({ id, title, eyebrow, children, code, wide }: { id: string; title: string; eyebrow?: string; children: React.ReactNode; code?: React.ReactNode; wide?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 border-t border-line px-5 py-14 sm:px-8 lg:scroll-mt-20 lg:px-12 lg:py-16">
      <div className={cn("grid gap-x-12 gap-y-8", code && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]")}>
        <div className="min-w-0 max-w-[640px]">
          {eyebrow && <p className="mb-2 text-[13px] font-medium text-ink-3">{eyebrow}</p>}
          <h2 id={`${id}-h`} className="text-[24px] leading-[1.25] font-semibold tracking-[-0.015em] text-ink">
            <a href={`#${id}`} className="group/h relative rounded-[4px] outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30">
              {title}
              <span className="ml-2 text-ink-3 opacity-0 transition-opacity duration-150 group-hover/h:opacity-100 group-focus-visible/h:opacity-100" aria-hidden>#</span>
            </a>
          </h2>
          <div className="mt-4">{children}</div>
        </div>
        {code && <div className="min-w-0 space-y-4 xl:sticky xl:top-24 xl:self-start">{code}</div>}
      </div>
      {wide && <div className="mt-8">{wide}</div>}
    </section>
  );
}

export function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h3 id={id} className="mt-8 scroll-mt-28 text-[16px] font-semibold text-ink lg:scroll-mt-20">{children}</h3>;
}
