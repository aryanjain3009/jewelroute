"use client";
/** Catalog — designs as an Attio table or a premium photo grid; a design opens in a side panel. */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BoxesIcon, CoinsIcon, GemIcon, HashIcon, LayersIcon, LayoutGridIcon, PercentIcon, PlusIcon, ScaleIcon, TableIcon, TagIcon } from "lucide-react";
import { formatGrams, formatINR, formatRate, PURITY_LABEL } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
import { Btn, Empty, FilterBar, FilterChip, RowsSkeleton, SearchInput, TitleBar, ViewBar, ViewTabs } from "@/components/app/chrome";
import { DataTable, Muted, NameCell, type Col } from "@/components/app/data-table";
import { OBJECT_TINT } from "@/components/app/shell";
import { useDesigns, useGoldRates, type AdminDesign } from "@/components/admin-v2/sales/data";
import { DesignSheet } from "@/components/admin-v2/sales/design-sheet";
import { ErrorState, Thumb, useHydrated } from "@/components/admin-v2/sales/ui";

const making = (d: AdminDesign) => (d.makingChargeType === "PER_GRAM" ? `${formatINR(d.makingChargeValue)}/g` : `${(d.makingChargeValue / 100).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);
const out = (d: AdminDesign) => d.pieces.filter((p) => p.custodianType === "AGENT" || p.custodianType === "SHOP").length;
const vault = (d: AdminDesign) => d.pieces.filter((p) => p.custodianType === "VAULT").length;

function Pieces({ d }: { d: AdminDesign }) {
  if (!d.pieces.length) return <Muted>No samples</Muted>;
  const o = out(d), v = vault(d);
  return <span className="num text-[14px]"><span className={v ? "text-ink" : "text-ink-3"}>{v} in vault</span><span className="text-ink-3"> · </span><span className={o ? "text-gold-ink" : "text-ink-3"}>{o} out</span></span>;
}

function CatalogBody() {
  const sp = useSearchParams(); const router = useRouter();
  const designs = useDesigns();
  const rates = useGoldRates();
  const all = React.useMemo(() => designs.data ?? [], [designs.data]);
  const cats = [...new Set(all.map((d) => d.category))].sort();
  const cat = sp.get("category") && cats.includes(sp.get("category")!) ? sp.get("category")! : "all";
  const layout = sp.get("layout") === "grid" ? "grid" : "table";
  const [q, setQ] = React.useState("");
  const [purity, setPurity] = React.useState("all");
  const [collection, setCollection] = React.useState("all");
  const [creating, setCreating] = React.useState(false);
  const openId = sp.get("design");
  const open = openId ? all.find((d) => d.id === openId) ?? null : null;
  const setParam = (k: string, v: string | null) => { const p = new URLSearchParams(sp.toString()); if (v === null) p.delete(k); else p.set(k, v); router.replace(`/admin/catalog?${p}`, { scroll: false }); };

  const s = q.trim().toLowerCase();
  const rows = all.filter((d) => (cat === "all" || d.category === cat) && (purity === "all" || d.purity === purity) && (collection === "all" || d.collection === collection) &&
    (!s || `${d.name} ${d.sku} ${d.collection} ${d.category}`.toLowerCase().includes(s)));

  const columns: Col<AdminDesign>[] = [
    { id: "name", header: "Design", accessorFn: (d) => d.name, meta: { icon: GemIcon, width: 250 }, cell: ({ row: { original: d } }) => <NameCell lead={<Thumb src={d.imageUrls[0]} alt={d.name} size={24} />} name={d.name} /> },
    { id: "sku", header: "SKU", accessorFn: (d) => d.sku, meta: { icon: HashIcon, width: 120 }, cell: ({ row: { original: d } }) => <span className="num text-ink-2">{d.sku}</span> },
    { id: "category", header: "Category", accessorFn: (d) => d.category, meta: { icon: TagIcon, width: 110 } },
    { id: "collection", header: "Collection", accessorFn: (d) => d.collection, meta: { icon: LayersIcon, width: 125 }, cell: ({ row: { original: d } }) => (d.collection ? d.collection : <Muted />) },
    { id: "purity", header: "Purity", accessorFn: (d) => d.purity, meta: { width: 70 }, cell: ({ row: { original: d } }) => <span className="text-gold-ink">{PURITY_LABEL[d.purity]}</span> },
    { id: "net", header: "Net wt", accessorFn: (d) => d.netWeightMg, meta: { icon: ScaleIcon, width: 90, align: "right" }, cell: ({ row: { original: d } }) => <span className="num">{formatGrams(d.netWeightMg)}</span> },
    { id: "making", header: "Making", accessorFn: (d) => d.makingChargeValue, meta: { icon: PercentIcon, width: 100, align: "right" }, cell: ({ row: { original: d } }) => <span className="num text-ink-2">{making(d)}</span> },
    { id: "price", header: "Today's price", accessorFn: (d) => d.price?.unitPricePaise ?? -1, meta: { icon: CoinsIcon, width: 130, align: "right" }, cell: ({ row: { original: d } }) => (d.price ? <span className="num font-medium text-gold-ink" title="Before 3% GST">{formatINR(d.price.unitPricePaise)}</span> : <Muted>No rate</Muted>) },
    { id: "pieces", header: "Samples", accessorFn: (d) => d.pieces.length, meta: { icon: BoxesIcon, width: 150 }, cell: ({ row: { original: d } }) => <Pieces d={d} /> },
  ];

  const ratesLine = rates.data?.current.filter((r) => ["K22", "K18"].includes(r.purity)).map((r) => `${PURITY_LABEL[r.purity]} ${formatRate(r.ratePaisePerGram)}`).join(" · ");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar icon={BoxesIcon} iconClass={OBJECT_TINT.catalog} title="Catalog" info="Designs and their physical sample pieces. Prices follow today's gold rate; booked orders keep the rate they were priced at.">
        <Btn variant="primary" icon={PlusIcon} onClick={() => setCreating(true)}>New design</Btn>
      </TitleBar>
      <ViewBar right={
        <div className="flex items-center gap-2">
          {ratesLine && <span className="hidden text-[13px] text-ink-2 lg:inline">Priced at <span className="num text-gold-ink">{ratesLine}</span></span>}
          <div className="flex items-center rounded-lg border border-line-strong bg-white p-0.5" role="group" aria-label="Layout">
            {([["table", TableIcon], ["grid", LayoutGridIcon]] as const).map(([v, I]) => (
              <button key={v} type="button" aria-label={`${v} layout`} aria-pressed={layout === v} onClick={() => setParam("layout", v === "table" ? null : v)} className={cn("grid size-7 place-items-center rounded-md", layout === v ? "bg-active text-ink" : "text-ink-3 hover:text-ink")}><I className="size-4" strokeWidth={1.75} /></button>
            ))}
          </div>
        </div>
      }>
        <ViewTabs value={cat} onChange={(v) => setParam("category", v === "all" ? null : v)} items={[{ value: "all", label: "All designs", count: designs.data ? all.length : undefined }, ...cats.map((c) => ({ value: c, label: c, count: all.filter((d) => d.category === c).length }))]} />
      </ViewBar>
      <FilterBar right={<SearchInput value={q} onChange={setQ} placeholder="Search design, SKU, collection" />}>
        <FilterChip label="Purity" value={purity} onChange={setPurity} options={[{ value: "all", label: "Any purity" }, ...["K24", "K22", "K18", "K14"].filter((k) => all.some((d) => d.purity === k)).map((k) => ({ value: k, label: PURITY_LABEL[k] }))]} />
        <FilterChip label="Collection" icon={LayersIcon} value={collection} onChange={setCollection} options={[{ value: "all", label: "Any collection" }, ...[...new Set(all.map((d) => d.collection).filter(Boolean))].sort().map((c) => ({ value: c, label: c }))]} />
      </FilterBar>
      {designs.error ? <ErrorState error={designs.error} retry={() => designs.refetch()} /> : designs.isLoading ? <RowsSkeleton /> : layout === "table" ? (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(d) => d.id}
          onOpen={(d) => setParam("design", d.id)}
          activeId={openId}
          selectable={false}
          countLabel="designs"
          initialSort={[{ id: "sku", desc: false }]}
          empty={<Empty icon={GemIcon} title={all.length ? "No designs match" : "No designs yet"} hint={all.length ? "Change the category or clear the filters." : "Add your first design, then take sample pieces into the vault."} action={<Btn icon={PlusIcon} onClick={() => setCreating(true)}>New design</Btn>} />}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {rows.length === 0 ? <Empty icon={GemIcon} title="No designs match" hint="Change the category or clear the filters." /> : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {rows.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => setParam("design", d.id)} className="group block w-full text-left">
                    <span className="relative block aspect-square overflow-hidden rounded-xl bg-sunken ring-1 ring-black/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {d.imageUrls[0] && <img src={d.imageUrls[0]} alt={d.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />}
                      <span className="absolute left-2 top-2 rounded-[5px] bg-white/90 px-1.5 py-0.5 text-[11.5px] font-semibold text-gold-ink">{PURITY_LABEL[d.purity]}</span>
                    </span>
                    <span className="mt-2.5 block truncate font-display text-[17px] leading-snug text-ink">{d.name}</span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-[13px] text-ink-3"><span className="num truncate">{d.sku} · {formatGrams(d.netWeightMg)}</span><Pieces d={d} /></span>
                    <span className="mt-1 block text-[14px]">{d.price ? <span className="num font-medium text-gold-ink">{formatINR(d.price.unitPricePaise)}<span className="font-normal text-ink-3"> + GST</span></span> : <span className="text-ink-3">No rate for {PURITY_LABEL[d.purity]}</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {(open || creating) && <DesignSheet design={creating ? null : open} onClose={() => { setCreating(false); setParam("design", null); }} />}
    </div>
  );
}

function CatalogInner() {
  const hydrated = useHydrated();
  return hydrated ? <CatalogBody /> : <RowsSkeleton />;
}

export default function CatalogPage() {
  return <React.Suspense fallback={<RowsSkeleton />}><CatalogInner /></React.Suspense>;
}
