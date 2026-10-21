"use client";
import { useMemo, useState } from "react";
import { Check, PackageOpen, Search, X } from "lucide-react";
import { formatGrams, formatINR } from "@jewelroute/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/app/chrome";
import { PurityTag } from "@/components/jr/money";
import type { Piece } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Thumb } from "../bits";
import { plural } from "../format";

/** Exact pieces in Rahul's custody (from the server). Pieces he doesn't hold are simply not here. */
export function MemoPicker({ bag, loading, selected, onToggle, disabled }: {
  bag?: Piece[]; loading: boolean; selected: string[]; onToggle: (pieceId: string) => void; disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rows = [...(bag ?? [])].sort((a, b) => a.name.localeCompare(b.name) || a.tagCode.localeCompare(b.tagCode));
    return t ? rows.filter((p) => [p.tagCode, p.name, p.sku].some((s) => s.toLowerCase().includes(t))) : rows;
  }, [bag, q]);

  if (loading) return <div className="space-y-px pt-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[68px] w-full" />)}</div>;
  if (!bag?.length) return <Empty icon={PackageOpen} title="Your bag is empty" hint="Pieces issued to you from the vault can be left on memo." />;

  return (
    <div>
      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tag code or design" aria-label="Search your bag"
            className="h-11 w-full rounded-lg border border-line-strong bg-paper pl-9 pr-10 text-[15px] outline-none placeholder:text-ink-3 focus:border-blue focus:ring-2 focus:ring-blue/15" />
          {q && <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-0.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center text-ink-3"><X className="size-4" /></button>}
        </div>
        <p className="mt-2.5 text-[12px] text-ink-3">{plural(bag.length, "piece")} in your bag. Pick the exact tags you hand over.</p>
      </div>
      <ul className="mt-2 border-y border-line" aria-label="Pieces in your bag">
        {list.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id} className="border-b border-line last:border-b-0">
              <button type="button" role="checkbox" aria-checked={on} disabled={disabled} onClick={() => onToggle(p.id)}
                className={cn("flex min-h-[68px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors disabled:opacity-60", on ? "bg-gold-soft/60" : "hover:bg-hover")}>
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-[5px] border", on ? "border-ink bg-ink text-white" : "border-line-strong bg-paper")}>{on && <Check className="size-3.5" strokeWidth={3} />}</span>
                <Thumb src={p.imageUrl} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="num block text-[15px] font-semibold text-ink">{p.tagCode}</span>
                  <span className="block truncate text-[13px] text-ink-2">{p.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3"><PurityTag purity={p.purity} className="h-[18px] px-1 text-[10.5px]" /><span className="num">{formatGrams(p.netWeightMg)} net</span></span>
                </span>
                <span className="num shrink-0 text-[14px] font-medium text-gold-ink">{formatINR(p.valuePaise)}</span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-4 py-8 text-center text-[14px] text-ink-2">No piece in your bag matches “{q}”.</li>}
      </ul>
    </div>
  );
}
