"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SearchX, X } from "lucide-react";
import { formatINR, formatRate, PURITY_LABEL } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Design, Purity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ErrorState, FieldEmpty, PRESS_BTN } from "../bits";
import { fmtDay, fmtTime, plural } from "../format";
import { errorMessage, useCatalog } from "../queries";
import type { CatalogRate } from "../types";

/** Search, category chips, purity filter and the photo grid. The cards are supplied by the caller. */
export function CatalogGrid({ visitId, renderCard, onlyInBag }: {
  visitId: string | null;
  renderCard: (d: Design, i: number) => React.ReactNode;
  onlyInBag?: boolean;
}) {
  // Filters live in the URL (?q=&cat=&purity=, next to the sale page's own mode/step) so refresh, Back and
  // Forward keep them. The search box types locally and lands in the URL after a short pause.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = params.get("q") ?? "";
  const category = params.get("cat") ?? "";
  const purity = params.get("purity") ?? "";
  const setParams = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v) sp.set(k, v); else sp.delete(k); }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setCategory = (c: string) => setParams({ cat: c });
  const setPurity = (p: string) => setParams({ purity: p });
  const [qRaw, setQRaw] = useState(q);
  useEffect(() => { setQRaw((cur) => (cur.trim() === q ? cur : q)); }, [q]);
  useEffect(() => {
    const t = setTimeout(() => { if (qRaw.trim() !== q) setParams({ q: qRaw.trim() }); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qRaw]);

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
          <input value={qRaw} onChange={(e) => setQRaw(e.target.value)} placeholder="Search design, SKU or collection" aria-label="Search designs" inputMode="search" enterKeyHint="search"
            className="h-11 w-full rounded-[10px] border border-line-strong bg-paper pl-9 pr-10 text-[15px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-blue focus:ring-2 focus:ring-blue/15" />
          {qRaw && <button type="button" aria-label="Clear search" onClick={() => setQRaw("")} className="absolute right-0.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center text-ink-3 hover:text-ink"><X className="size-4" /></button>}
        </div>
      </div>
      <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto px-4 pb-1 pt-2.5 [mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)] [&>:last-child]:mr-8">
        {(facets?.purities ?? []).length > 1 && (
          <ToggleGroup type="single" value={purity || "any"} onValueChange={(v) => setPurity(v === "any" || !v ? "" : v)} aria-label="Purity"
            className="mr-1 h-9 shrink-0 gap-0 rounded-lg border border-line-strong p-0.5">
            {["any", ...(facets?.purities ?? [])].map((p) => (
              <ToggleGroupItem key={p} value={p} className="num h-full min-w-0 rounded-md px-2.5 text-[13px] font-medium text-ink-2 hover:bg-transparent hover:text-ink data-[state=on]:bg-active data-[state=on]:text-ink">
                {p === "any" ? "Any" : PURITY_LABEL[p as Purity]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        {["", ...(facets?.categories ?? [])].map((c) => (
          <button key={c || "all"} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
            className={cn("h-9 shrink-0 rounded-lg border px-3 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:active:scale-[0.96]",
              category === c ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:bg-hover hover:text-ink")}>
            {c || "All"}
          </button>
        ))}
      </div>

      <div className="px-4 pt-3">
        {cat.isPending ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6" aria-busy>
            {Array.from({ length: 6 }).map((_, i) => <div key={i}><Skeleton className="aspect-[4/5] w-full rounded-xl" /><Skeleton className="mt-3 h-4 w-3/4" /><Skeleton className="mt-2 h-3 w-1/2" /><Skeleton className="mt-2 h-4 w-2/5" /></div>)}
          </div>
        ) : cat.isError ? (
          <ErrorState title="Couldn't load the catalog" message={errorMessage(cat.error)} onRetry={() => cat.refetch()} />
        ) : designs.length === 0 ? (
          <FieldEmpty icon={SearchX} title={onlyInBag ? "None of these designs are in your bag" : q ? `No designs match “${q}”` : "No designs match these filters"}
            hint={filtersOn ? "Try another word, or clear the filters to see the whole catalog." : undefined}
            action={filtersOn ? <Button variant="outline" className={cn("h-11 px-4 text-[15px]", PRESS_BTN)} onClick={() => { setQRaw(""); setParams({ q: "", cat: "", purity: "" }); }}>Clear filters</Button> : undefined} />
        ) : (
          <>
            <p className="mb-3 text-[12px] text-ink-3">{plural(designs.length, "design")}{filtersOn ? " match" : ""}</p>
            <div className={cn("grid grid-cols-2 gap-x-3 gap-y-6 transition-opacity duration-150", cat.isFetching && cat.isPlaceholderData && "opacity-60")}>
              {designs.map((d, i) => <div key={d.id}>{renderCard(d, i)}</div>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RateStrip({ rates }: { rates?: CatalogRate[] }) {
  if (!rates) return <div className="px-4 pt-3"><Skeleton className="h-[52px] w-full rounded-lg" /></div>;
  const order: Purity[] = ["K22", "K18", "K24", "K14"];
  const sorted = [...rates].sort((a, b) => order.indexOf(a.purity) - order.indexOf(b.purity));
  const latest = rates.reduce((m, r) => (Date.parse(r.effectiveFrom) > Date.parse(m) ? r.effectiveFrom : m), rates[0]?.effectiveFrom ?? "");
  return (
    <section aria-label="Today's gold rate" className="mx-4 mt-3 rounded-lg bg-sunken px-3.5 py-2">
      <p className="text-[12px] text-ink-2">Gold rate per gram{latest && <>, as of <span className="num">{fmtTime(latest)}, {fmtDay(latest)}</span></>}</p>
      {sorted.length ? (
        <div className="scrollbar-none mt-0.5 flex gap-4 overflow-x-auto">
          {sorted.map((r) => (
            <span key={r.purity} className="flex shrink-0 items-baseline gap-1.5">
              <span className="text-[12px] font-semibold text-ink-3">{PURITY_LABEL[r.purity]}</span>
              <span className="num text-[15px] font-semibold text-gold-ink" title={formatRate(r.ratePaisePerGram)}>{formatINR(r.ratePaisePerGram)}</span>
            </span>
          ))}
        </div>
      ) : <p className="mt-0.5 text-[13px] text-warn">Not published today, so prices can’t be shown</p>}
    </section>
  );
}
