"use client";
/** Samples — "Where every piece is". Attio list of every tagged piece with its one current custodian. */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArchiveRestoreIcon, BoxesIcon, CircleDotIcon, ClockIcon, GemIcon, IndianRupeeIcon, LandmarkIcon, MapPinIcon, ScaleIcon, SendIcon, TagIcon, UserIcon, UsersIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatGrams, formatINR, formatINRCompact, PURITY_LABEL } from "@jewelroute/shared";
import { api } from "@/lib/api";
import { qk } from "@/lib/sync";
import type { PieceRow, PieceStatus, ShopRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, Btn, Empty, FilterBar, FilterChip, RowsSkeleton, SearchInput, TitleBar, ViewBar, ViewTabs } from "@/components/app/chrome";
import { DataTable, Muted, NameCell, type Col } from "@/components/app/data-table";
import { OBJECT_TINT } from "@/components/app/shell";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePieces } from "@/components/admin-v2/sales/data";
import { IssueDialog, ReturnDialog } from "@/components/admin-v2/sales/piece-actions";
import { ErrorState, fmtDay, holderLabel, PieceStatusDot, Thumb, ViewStat, useHydrated } from "@/components/admin-v2/sales/ui";
import { relTime } from "@/components/app/timeline";

type View = "all" | "vault" | "agents" | "memo" | "overdue" | "sold";
const IN_VIEW: Record<View, PieceStatus[] | null> = { all: null, vault: ["IN_VAULT"], agents: ["WITH_AGENT"], memo: ["ON_MEMO", "OVERDUE"], overdue: ["OVERDUE"], sold: ["SOLD"] };
const holderKey = (p: PieceRow) => (p.custodianType === "AGENT" ? `A:${p.custodian.agentId}` : p.custodianType === "SHOP" ? `S:${p.custodian.shopId}` : p.custodianType);

function HolderLead({ p }: { p: PieceRow }) {
  if (p.custodianType === "AGENT") return <Avatar name={holderLabel(p)} />;
  if (p.custodianType === "SHOP") return <Avatar name={holderLabel(p)} square />;
  return <span className="grid size-5 place-items-center rounded-[5px] bg-[#f1f1f2] text-ink-2"><LandmarkIcon className="size-3" strokeWidth={2} /></span>;
}

function SamplesBody() {
  const sp = useSearchParams(); const router = useRouter();
  const v = sp.get("view");
  const view: View = v && v in IN_VIEW ? (v as View) : "all";
  const [q, setQ] = React.useState("");
  const [holder, setHolder] = React.useState(sp.get("holder") ?? "all");
  const [purity, setPurity] = React.useState("all");
  const [dialog, setDialog] = React.useState<{ kind: "issue" | "return"; rows: PieceRow[]; clear: () => void } | null>(null);
  const pieces = usePieces();
  // Agent-held pieces carry the API's own `location`; retailer areas come from the shop records.
  const shops = useQuery({ queryKey: [...qk.shops, "all"], queryFn: () => api<ShopRow[]>("/admin/shops"), staleTime: 60_000 });
  const area = new Map((shops.data ?? []).map((s) => [s.id, s.area]));

  const all = React.useMemo(() => pieces.data ?? [], [pieces.data]);
  const holders = React.useMemo(() => {
    const m = new Map<string, { key: string; label: string; type: string; count: number; value: number }>();
    for (const p of all) {
      const k = holderKey(p); const h = m.get(k) ?? { key: k, label: holderLabel(p), type: p.custodianType, count: 0, value: 0 };
      h.count++; h.value += p.valuePaise; m.set(k, h);
    }
    const order = ["VAULT", "AGENT", "SHOP", "SOLD", "LOST"];
    return [...m.values()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || b.value - a.value);
  }, [all]);
  const by = (t: string) => holders.filter((h) => h.type === t).reduce((a, h) => ({ count: a.count + h.count, value: a.value + h.value }), { count: 0, value: 0 });

  const s = q.trim().toLowerCase();
  const rows = all.filter((p) =>
    (!IN_VIEW[view] || IN_VIEW[view]!.includes(p.status)) && (holder === "all" || holderKey(p) === holder) && (purity === "all" || p.purity === purity) &&
    (!s || `${p.tagCode} ${p.name} ${p.sku} ${p.collection} ${holderLabel(p)} ${p.memo?.number ?? ""}`.toLowerCase().includes(s)),
  );
  const total = rows.reduce((a, p) => a + p.valuePaise, 0);

  const location = (p: PieceRow): React.ReactNode => {
    if (p.custodianType === "SHOP") return <span className="truncate">{area.get(p.custodian.shopId ?? "") ?? p.custodian.shopName}{p.memo && <span className="text-ink-3"> · {p.memo.number.replace(/^MEMO-\d{4}-0*/, "Memo ")}</span>}</span>;
    if (p.custodianType === "AGENT") {
      const l = p.location;
      if (!l) return <Muted />;
      if (l.kind === "IN_VISIT") return <span className="truncate" title={l.label}>At {l.shop?.name ?? l.label} <span className="text-ink-3">· in visit</span></span>;
      if (l.kind === "LAST_CHECK_IN") return <span className="truncate text-ink-2" title={l.label}>Field bag <span className="text-ink-3">· last at {l.shop?.name}</span></span>;
      return <span className="truncate text-ink-2">{l.label}</span>;
    }
    if (p.custodianType === "VAULT") return <span className="text-ink-3">In the vault</span>;
    return <Muted />;
  };

  const columns: Col<PieceRow>[] = [
    { id: "tag", header: "Tag", accessorFn: (p) => p.tagCode, meta: { icon: TagIcon, width: 155 }, cell: ({ row: { original: p } }) => <NameCell lead={<Thumb src={p.imageUrl} alt={p.name} />} name={<span className="num">{p.tagCode}</span>} /> },
    { id: "design", header: "Design", accessorFn: (p) => p.name, meta: { icon: GemIcon, width: 190 }, cell: ({ row: { original: p } }) => <span className="truncate" title={p.collection ? `${p.name} · ${p.collection} collection` : p.name}>{p.name}</span> },
    { id: "purity", header: "Purity", accessorFn: (p) => p.purity, meta: { width: 64 }, cell: ({ row: { original: p } }) => <span className="text-gold-ink">{PURITY_LABEL[p.purity]}</span> },
    { id: "net", header: "Net wt", accessorFn: (p) => p.netWeightMg, meta: { icon: ScaleIcon, width: 92, align: "right" }, cell: ({ row: { original: p } }) => <span className="num">{formatGrams(p.netWeightMg)}</span> },
    {
      id: "value", header: "Value today", accessorFn: (p) => p.valuePaise, meta: { icon: IndianRupeeIcon, width: 122, align: "right", footer: rows.length ? <span className="num font-medium text-gold-ink">{formatINRCompact(total)}</span> : undefined },
      cell: ({ row: { original: p } }) => <span className="num font-medium text-gold-ink">{formatINR(p.valuePaise)}</span>,
    },
    { id: "holder", header: "Custodian", accessorFn: (p) => holderLabel(p), meta: { icon: UserIcon, width: 160 }, cell: ({ row: { original: p } }) => <span className="flex min-w-0 items-center gap-2"><HolderLead p={p} /><span className="truncate">{holderLabel(p)}</span></span> },
    { id: "location", header: "Location", accessorFn: (p) => p.custodianType, meta: { icon: MapPinIcon, width: 160 }, cell: ({ row: { original: p } }) => location(p) },
    {
      id: "status", header: "Status", accessorFn: (p) => p.status, meta: { icon: CircleDotIcon, width: 145 },
      cell: ({ row: { original: p } }) => <span className="flex items-baseline gap-1.5"><PieceStatusDot status={p.status} />{p.memo && (p.status === "ON_MEMO" || p.status === "OVERDUE") && <span className={cn("num text-[12px]", p.status === "OVERDUE" ? "text-danger" : "text-ink-3")}>due {fmtDay(p.memo.dueDate)}</span>}</span>,
    },
    { id: "moved", header: "Last moved", accessorFn: (p) => p.lastMovedAt, meta: { icon: ClockIcon, width: 110 }, cell: ({ row: { original: p } }) => (p.lastMovedAt ? <span className="num" title={p.lastMovedAt}>{relTime(p.lastMovedAt)}</span> : <Muted />) },
  ];

  const setView = (nv: string) => { const p = new URLSearchParams(sp.toString()); p.set("view", nv); router.replace(`/admin/samples?${p}`); };
  const count = (vv: View) => (IN_VIEW[vv] ? all.filter((p) => IN_VIEW[vv]!.includes(p.status)).length : all.length);
  const vault = by("VAULT"), agents = by("AGENT"), shopsAt = by("SHOP");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar icon={GemIcon} iconClass={OBJECT_TINT.samples} title="Samples" info="Every tagged sample piece and the one person or place holding it right now, from the append-only custody ledger." />
      <ViewBar right={pieces.data && (
        <div className="hidden items-center gap-0.5 xl:flex">
          <ViewStat label="Vault" count={vault.count} value={formatINRCompact(vault.value)} tone="grey" onClick={() => setView("vault")} active={view === "vault"} />
          <ViewStat label="Agents" count={agents.count} value={formatINRCompact(agents.value)} tone="blue" onClick={() => setView("agents")} active={view === "agents"} />
          <ViewStat label="Retailers" count={shopsAt.count} value={formatINRCompact(shopsAt.value)} tone="gold" onClick={() => setView("memo")} active={view === "memo"} />
          <Popover>
            <PopoverTrigger asChild><Btn size="sm" icon={UsersIcon} className="ml-1.5">By custodian</Btn></PopoverTrigger>
            <PopoverContent align="end" className="w-80 gap-0 p-1">
              <p className="px-2 pb-1.5 pt-1 text-[12px] text-ink-3">Grouped by current custodian · value at today&apos;s rate</p>
              <div className="max-h-80 overflow-y-auto">
                {holders.map((h) => (
                  <button key={h.key} type="button" onClick={() => setHolder(h.key === holder ? "all" : h.key)} className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-hover", holder === h.key && "bg-selected")}>
                    {h.type === "AGENT" ? <Avatar name={h.label} size={18} /> : h.type === "SHOP" ? <Avatar name={h.label} size={18} square /> : <span className="grid size-[18px] place-items-center rounded-[5px] bg-[#f1f1f2] text-ink-2"><LandmarkIcon className="size-3" /></span>}
                    <span className="truncate text-ink">{h.label}</span>
                    <span className="num ml-auto shrink-0 text-ink-3">{h.count}</span>
                    <span className="num w-16 shrink-0 text-right text-gold-ink">{formatINRCompact(h.value)}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}>
        <ViewTabs value={view} onChange={setView} items={([
          ["all", "All"], ["vault", "In vault"], ["agents", "With agents"], ["memo", "On memo"], ["overdue", "Overdue"], ["sold", "Sold"],
        ] as [View, string][]).map(([value, label]) => ({ value, label, count: pieces.data ? count(value) : undefined }))} />
      </ViewBar>
      <FilterBar right={<SearchInput value={q} onChange={setQ} placeholder="Search tag, design, holder, memo" />}>
        <FilterChip label="Custodian" icon={UserIcon} value={holder} onChange={setHolder} options={[{ value: "all", label: "Anyone" }, ...holders.map((h) => ({ value: h.key, label: h.label }))]} />
        <FilterChip label="Purity" icon={BoxesIcon} value={purity} onChange={setPurity} options={[{ value: "all", label: "Any purity" }, ...["K24", "K22", "K18", "K14"].filter((k) => all.some((p) => p.purity === k)).map((k) => ({ value: k, label: PURITY_LABEL[k] }))]} />
      </FilterBar>
      {pieces.error ? <ErrorState error={pieces.error} retry={() => pieces.refetch()} /> : pieces.isLoading ? <RowsSkeleton /> : (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(p) => p.id}
          onOpen={(p) => router.push(`/admin/samples/${p.id}`)}
          countLabel="pieces"
          initialSort={[{ id: "tag", desc: false }]}
          rowClassName={(p) => (p.status === "SOLD" ? "text-ink-2" : undefined)}
          empty={<Empty icon={GemIcon} title="No pieces match" hint={all.length ? "Change the view or clear the filters." : "Take pieces into the vault from a design in the catalog."} action={!all.length ? <Btn onClick={() => router.push("/admin/catalog")}>Open catalog</Btn> : undefined} />}
          bulkActions={(sel, clear) => {
            const vaultSel = sel.filter((p) => p.status === "IN_VAULT"), bagSel = sel.filter((p) => p.status === "WITH_AGENT");
            return (
              <>
                <Btn variant="ghost" size="sm" icon={SendIcon} disabled={!vaultSel.length || vaultSel.length !== sel.length} title={vaultSel.length !== sel.length ? "Select only pieces in the vault" : undefined} onClick={() => setDialog({ kind: "issue", rows: vaultSel, clear })}>Issue to agent</Btn>
                <Btn variant="ghost" size="sm" icon={ArchiveRestoreIcon} disabled={!bagSel.length || bagSel.length !== sel.length} title={bagSel.length !== sel.length ? "Select only pieces in agents' bags" : undefined} onClick={() => setDialog({ kind: "return", rows: bagSel, clear })}>Return to vault</Btn>
              </>
            );
          }}
        />
      )}
      <IssueDialog pieces={dialog?.kind === "issue" ? dialog.rows : []} open={dialog?.kind === "issue"} onOpenChange={(o) => !o && setDialog(null)} onDone={() => dialog?.clear()} />
      <ReturnDialog pieces={dialog?.kind === "return" ? dialog.rows : []} open={dialog?.kind === "return"} onOpenChange={(o) => !o && setDialog(null)} onDone={() => dialog?.clear()} />
    </div>
  );
}

function SamplesInner() {
  const hydrated = useHydrated();
  return hydrated ? <SamplesBody /> : <RowsSkeleton />;
}

export default function SamplesPage() {
  return <React.Suspense fallback={<RowsSkeleton />}><SamplesInner /></React.Suspense>;
}
