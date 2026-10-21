import { cn } from "@/lib/utils";
/** Mark: a route line passing through a faceted stone. */
export function Logo({ className, withWord = true }: { className?: string; withWord?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <path d="M2 17c4 0 5-10 10-10s6 10 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="0.1 3.2" />
        <path d="M12 3.5l4 3.5-4 6-4-6z" fill="#b08a35" />
        <path d="M8 7h8M12 3.5v9.5" stroke="#fcfbf8" strokeWidth=".8" />
      </svg>
      {withWord && <span className="text-[17px] font-semibold tracking-[-0.02em]">JewelRoute</span>}
    </span>
  );
}
