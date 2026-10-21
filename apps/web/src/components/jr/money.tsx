import { formatINR, formatINRCompact, formatGrams, PURITY_LABEL } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
export const Money = ({ paise, compact, exact, className }: { paise: number; compact?: boolean; exact?: boolean; className?: string }) => (
  <span className={cn("num", className)}>{compact ? formatINRCompact(paise) : formatINR(paise, exact)}</span>
);
export const Grams = ({ mg, className }: { mg: number; className?: string }) => <span className={cn("num", className)}>{formatGrams(mg)}</span>;
export const PurityTag = ({ purity, className }: { purity: string; className?: string }) => (
  <span className={cn("inline-flex h-5 items-center rounded-[5px] border border-gold/40 px-1.5 text-[11px] font-semibold text-gold-ink num", className)}>{PURITY_LABEL[purity] ?? purity}</span>
);
