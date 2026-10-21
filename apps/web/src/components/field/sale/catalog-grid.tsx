"use client";
import { useEffect, useState } from "react";
import { Search, SearchX, X } from "lucide-react";
import { formatRate, PURITY_LABEL } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Design, Purity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ErrorState } from "../bits";
import { fmtTime, plural } from "../format";
import { errorMessage, useCatalog } from "../queries";
import type { CatalogRate } from "../types";

/** Search, category chips, purity filter and the photo grid. The cards are supplied by the caller. */
export function CatalogGrid({ visitId, renderCard, onlyInBag }: {
  visitId: string | null;
  renderCard: (d: Design, i: number) => React.ReactNode;
  onlyInBag?: boolean;
}) {
  const [qRaw, setQRaw] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [purity, setPurity] = useState("");
  useEffect(() => { const t = setTimeout(() => setQ(qRaw.trim()), 250); return () => clearTimeout(t); }, [qRaw]);

  const all = useCatalog(visitId); // unfiltered: facets + rates
  const cat = useCatalog(visitId, { q: q || undefined, category: category || undefined, purity: purity || undefined });
  const facets = all.data?.facets;
  let designs = cat.data?.designs ?? [];
  if (onlyInBag) designs = designs.filter((d) => d.availablePieces?.length);
  const filtersOn = !!(q || category || purity);

  return (
    <div>
      <RateStrip rates={all.data?.rates?.filter((r) => !facets || facets.purities.includes(r.purity))} />
      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input value={qRaw} onChange={(e) => setQRaw(e.target.value)} placeholder="Search design, SKU or collection" aria-label="Search designs" inputMode="search"
            className="h-11 w-full rounded-lg border border-line-strong bg-paper pl-9 pr-10 text-[15px] outline-none placeholder:text-ink-3 focus:border-blue focus:ring-2 focus:ring-blue/15" />
          {qRaw && <button type="button" aria-label="Clear search" onClick={() => setQRaw("")} className="absolute right-0.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center text-ink-3 hover:text-ink"><X className="size-4" /></button>}
        </div>
      </div>
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-1 pt-2.5">
        {(facets?.purities ?? []).length > 1 && (
          <div className="mr-1 flex h-9 shrink-0 rounded-lg border border-line-strong p-0.5" role="radiogroup" aria-label="Purity">
            {["", ...(facets?.purities ?? [])].map((p) => (
              <button key={p || "all"} type="button" role="radio" aria-checked={purity === p} onClick={() => setPurity(p)}
                className={cn("num h-full rounded-md px-2.5 text-[13px] font-medium", purity === p ? "bg-active text-ink" : "text-ink-2")}>
                {p ? PURITY_LABEL[p as Purity] : "Any"}
              </button>
            ))}
          </div>
        )}
        {["", ...(facets?.categories ?? [])].map((c) => (
          <button key={c || "all"} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
            className={cn("h-9 shrink-0 rounded-lg border px-3 text-[13px] font-medium transition-colors", category === c ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:bg-hover hover:text-ink")}>
            {c || "All"}
          </button>
        ))}
      </div>

      <div className="px-4 pt-3">
        {cat.isPending ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            {Array.from({ length: 6 }).map((_, i) => <div key={i}><Skeleton className="aspect-[4/5] w-full rounded-xl" /><Skeleton className="mt-2.5 h-4 w-3/4" /><Skeleton className="mt-1.5 h-3 w-1/2" /></div>)}
          </div>
        ) : cat.isError ? (
          <ErrorState title="Couldn't load the catalog" message={errorMessage(cat.error)} onRetry={() => cat.refetch()} />
        ) : designs.length === 0 ? (
          <div className="py-14 text-center">
            <SearchX className="mx-auto size-5 text-ink-3" strokeWidth={1.75} />
            <p className="mt-3 text-[15px] font-medium text-ink">{onlyInBag ? "None of these designs are in your bag" : "No designs match"}</p>
            {filtersOn && <Button variant="outline" className="mt-4 h-10" onClick={() => { setQRaw(""); setCategory(""); setPurity(""); }}>Clear filters</Button>}
          </div>
        ) : (
          <>
            <p className="mb-2.5 text-[12px] text-ink-3">{plural(designs.length, "design")}</p>
            <div className={cn("grid grid-cols-2 gap-x-3 gap-y-6", cat.isFetching && "opacity-70 transition-opacity")}>
              {designs.map((d, i) => <div key={d.id}>{renderCard(d, i)}</div>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RateStrip({ rates }: { rates?: CatalogRate[] }) {
  if (!rates) return <div className="px-4 pt-3"><Skeleton className="h-10 w-full rounded-lg" /></div>;
  const order: Purity[] = ["K22", "K18", "K24", "K14"];
  const sorted = [...rates].sort((a, b) => order.indexOf(a.purity) - order.indexOf(b.purity));
  const latest = rates.reduce((m, r) => (Date.parse(r.effectiveFrom) > Date.parse(m) ? r.effectiveFrom : m), rates[0]?.effectiveFrom ?? "");
  return (
    <div className="mx-4 mt-3 flex items-center gap-4 overflow-x-auto rounded-lg border border-line px-3 py-2 scrollbar-none" aria-label="Today's gold rate">
      {sorted.map((r) => (
        <span key={r.purity} className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-[12px] font-medium text-ink-3">{PURITY_LABEL[r.purity]}</span>
          <span className="num text-[14px] font-semibold text-gold-ink">{formatRate(r.ratePaisePerGram)}</span>
        </span>
      ))}
      {latest && <span className="num ml-auto shrink-0 text-[12px] text-ink-3">as of {fmtTime(latest)}</span>}
    </div>
  );
}
