"use client";
import { useMemo, useState } from "react";
import { PackageOpen, Search, X } from "lucide-react";
import { formatGrams, formatINR } from "@jewelroute/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { PurityTag } from "@/components/jr/money";
import type { Piece } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FieldEmpty, Thumb } from "../bits";
import { plural } from "../format";

/** Exact pieces in Rahul's custody (from the server). Pieces he doesn't hold are simply not here. */
export function MemoPicker({ bag, loading, selected, onToggle, disabled }: {
  bag?: Piece[]; loading: boolean; selected: string[]; onToggle: (pieceId: string) => void; disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    // Picked pieces stay pinned at the top so the agent always sees what is about to leave the bag.
    const picked = new Set(selected);
    const rows = [...(bag ?? [])].sort((a, b) =>
      Number(picked.has(b.id)) - Number(picked.has(a.id)) || a.name.localeCompare(b.name) || a.tagCode.localeCompare(b.tagCode));
    return t ? rows.filter((p) => picked.has(p.id) || [p.tagCode, p.name, p.sku].some((s) => s.toLowerCase().includes(t))) : rows;
  }, [bag, q, selected]);

  if (loading) return <div className="mt-3 divide-y divide-line border-y border-line" aria-busy>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex items-center gap-3 px-4 py-3"><Skeleton className="size-5 rounded-[5px]" /><Skeleton className="size-12 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-40" /></div><Skeleton className="h-4 w-16" /></div>)}</div>;
  if (!bag?.length) return <FieldEmpty icon={PackageOpen} title="Your bag is empty" hint="Pieces issued to you from the vault can be left on memo. Ask the office to issue samples." />;

  return (
    <div>
      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tag code or design" aria-label="Search your bag" inputMode="search" enterKeyHint="search"
            className="h-11 w-full rounded-[10px] border border-line-strong bg-paper pl-9 pr-10 text-[15px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-blue focus:ring-2 focus:ring-blue/15" />
          {q && <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-0.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center text-ink-3"><X className="size-4" /></button>}
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3 text-[12px] text-ink-3">
          <span>Pick the exact tags you hand over</span>
          <span><span className="num">{plural(bag.length, "piece")}</span> in your bag</span>
        </div>
      </div>
      <ul className="mt-2 border-y border-line" aria-label="Pieces in your bag">
        {list.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id} className="border-b border-line last:border-b-0">
              <label className={cn("flex min-h-[72px] cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors duration-150",
                on ? "bg-selected" : "hover:bg-hover active:bg-sunken", disabled && "cursor-not-allowed opacity-60")}>
                <Checkbox checked={on} disabled={disabled} onCheckedChange={() => onToggle(p.id)} aria-label={`${p.tagCode}, ${p.name}`}
                  className="size-5 rounded-[5px] border-[#c9cacd] bg-paper data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-white" />
                <Thumb src={p.imageUrl} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="num block text-[15px] font-semibold text-ink">{p.tagCode}</span>
                  <span className="block truncate text-[13px] text-ink-2">{p.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3"><PurityTag purity={p.purity} className="h-[18px] px-1 text-[10.5px]" /><span className="num">{formatGrams(p.netWeightMg)} net</span></span>
                </span>
                <span className="num shrink-0 text-right text-[14px] font-medium text-gold-ink">{formatINR(p.valuePaise)}</span>
              </label>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-4 py-10 text-center text-[14px] text-ink-2">No piece in your bag matches “{q}”.</li>}
      </ul>
    </div>
  );
}
