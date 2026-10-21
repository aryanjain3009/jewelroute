"use client";
/** Shops — Attio list page (TitleBar → ViewBar → FilterBar → DataTable), same structure as Visits. */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClockIcon, CircleDotIcon, ClockIcon, GemIcon, MapPinIcon, PlusIcon, ReceiptTextIcon, ScrollTextIcon, StoreIcon, UserIcon, UserPlusIcon } from "lucide-react";
import { formatINRCompact, istDate } from "@jewelroute/shared";
import { api } from "@/lib/api";
import { useSync } from "@/lib/sync";
import type { ShopRow } from "@/lib/types";
import { Avatar, Btn, Empty, FilterBar, FilterChip, RowsSkeleton, SearchInput, SortChip, TitleBar, ViewBar, ViewTabs } from "@/components/app/chrome";
import { DataTable, Muted, NameCell, type Col } from "@/components/app/data-table";
import { OBJECT_TINT } from "@/components/app/shell";
import { useAgentOptions, useShops } from "./data";
import { ShopSheet, errMsg } from "./dialogs";
import { QueryError, SHOP_STATUS, StatusDot, daysAgo, istDay, wallTime } from "./ui";

type View = "all" | "attention" | "unassigned" | "dormant";
type Sort = "name" | "lastVisit" | "outstanding" | "samples" | "nextVisit";
const SORTS: { value: Sort; label: string }[] = [
  { value: "lastVisit", label: "Last visit" }, { value: "outstanding", label: "Outstanding" }, { value: "samples", label: "Samples value" },
  { value: "nextVisit", label: "Next visit" }, { value: "name", label: "Name" },
];
const sum = (rows: ShopRow[], f: (r: ShopRow) => number) => rows.reduce((a, r) => a + f(r), 0);

export function ShopsList() {
  const sp = useSearchParams(); const router = useRouter();
  const view = (sp.get("view") as View) ?? "all";
  const [q, setQ] = React.useState("");
  const [agent, setAgent] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [area, setArea] = React.useState("all");
  const [sort, setSort] = React.useState<Sort>("lastVisit");
  const [creating, setCreating] = React.useState(false);
  const shops = useShops();
  const agents = useAgentOptions();
  const all = shops.data ?? [];
  const areas = [...new Set(all.map((s) => s.area))].sort();

  const inView = (r: ShopRow) =>
    view === "attention" ? r.status === "MEMO_OVERDUE"
      : view === "unassigned" ? !r.assignedAgent
      : view === "dormant" ? r.status === "DORMANT" || r.status === "NEW" : true;
  const rows = all.filter((r) =>
    inView(r) &&
    (agent === "all" || (agent === "none" ? !r.assignedAgent : r.assignedAgent?.id === agent)) &&
    (status === "all" || r.status === status) &&
    (area === "all" || r.area === area) &&
    (!q || `${r.name} ${r.code} ${r.area} ${r.ownerName ?? ""} ${r.assignedAgent?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  ).sort((a, b) => {
    switch (sort) {
      case "name": return a.name.localeCompare(b.name);
      case "lastVisit": return (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? "");
      case "outstanding": return b.openOrdersPaise - a.openOrdersPaise;
      case "samples": return b.samplesHereValuePaise - a.samplesHereValuePaise;
      case "nextVisit": return (a.nextVisit ? `${a.nextVisit.date} ${a.nextVisit.plannedTime ?? ""}` : "9").localeCompare(b.nextVisit ? `${b.nextVisit.date} ${b.nextVisit.plannedTime ?? ""}` : "9");
    }
  });
  const today = istDate();

  const columns: Col<ShopRow>[] = [
    {
      id: "shop", header: "Shop", accessorFn: (r) => r.name, meta: { icon: StoreIcon, width: 190 },
      cell: ({ row: { original: r } }) => <span className="block min-w-0" title={r.name}><NameCell lead={<Avatar name={r.name} size={20} square />} name={r.name} /></span>,
    },
    { id: "area", header: "Area", accessorFn: (r) => r.area, meta: { icon: MapPinIcon, width: 100 }, cell: ({ row: { original: r } }) => <span className="block min-w-0 truncate" title={r.area}>{r.area}</span> },
    {
      id: "agent", header: "Assigned agent", accessorFn: (r) => r.assignedAgent?.name ?? "", meta: { icon: UserIcon, width: 146 },
      cell: ({ row: { original: r } }) => (r.assignedAgent ? <span className="flex min-w-0 items-center gap-2"><Avatar name={r.assignedAgent.name} /><span className="truncate">{r.assignedAgent.name}</span></span> : <Muted>Unassigned</Muted>),
    },
    {
      id: "lastVisit", header: "Last visit", accessorFn: (r) => r.lastVisitAt ?? "", meta: { icon: ClockIcon, width: 104 },
      cell: ({ row: { original: r } }) => {
        if (!r.lastVisitAt) return <Muted>Never</Muted>;
        const n = daysAgo(r.lastVisitAt) ?? 0;
        return <span className={n > 30 ? "num text-warn" : "num"}>{n === 0 ? "Today" : n === 1 ? "Yesterday" : n < 7 ? `${n} days ago` : istDay(r.lastVisitAt)}</span>;
      },
    },
    {
      id: "outstanding", header: "Open orders", accessorFn: (r) => r.openOrdersPaise, meta: { icon: ReceiptTextIcon, width: 124, align: "right", footer: <FooterSum v={sum(rows, (r) => r.openOrdersPaise)} /> },
      cell: ({ row: { original: r } }) => (r.openOrdersPaise ? <span className="num">{formatINRCompact(r.openOrdersPaise)}</span> : <Muted />),
    },
    {
      id: "memos", header: "Memos", accessorFn: (r) => r.activeMemoValuePaise, meta: { icon: ScrollTextIcon, width: 104, align: "right", footer: <FooterSum v={sum(rows, (r) => r.activeMemoValuePaise)} gold /> },
      cell: ({ row: { original: r } }) => (r.activeMemoCount ? <span className="num"><span className="text-ink-3">{r.activeMemoCount} · </span><span className="text-gold-ink">{formatINRCompact(r.activeMemoValuePaise)}</span></span> : <Muted />),
    },
    {
      id: "samples", header: "Samples", accessorFn: (r) => r.samplesHereValuePaise, meta: { icon: GemIcon, width: 108, align: "right", footer: <FooterSum v={sum(rows, (r) => r.samplesHereValuePaise)} gold /> },
      cell: ({ row: { original: r } }) => (r.samplesHereCount ? <span className="num"><span className="text-ink-3">{r.samplesHereCount} · </span><span className="text-gold-ink">{formatINRCompact(r.samplesHereValuePaise)}</span></span> : <Muted />),
    },
    {
      id: "nextVisit", header: "Next visit", accessorFn: (r) => r.nextVisit ? `${r.nextVisit.date} ${r.nextVisit.plannedTime ?? ""}` : "~", meta: { icon: CalendarClockIcon, width: 136 },
      cell: ({ row: { original: r } }) => (r.nextVisit ? <span className="num truncate" title={`${r.nextVisit.agent.name}`}>{r.nextVisit.date === today ? "Today" : istDay(r.nextVisit.date)}{r.nextVisit.plannedTime ? `, ${wallTime(r.nextVisit.plannedTime)}` : ""}</span> : <Muted>Not planned</Muted>),
    },
    { id: "status", header: "Status", accessorFn: (r) => r.status, meta: { icon: CircleDotIcon, width: 140 }, cell: ({ row: { original: r } }) => <StatusDot map={SHOP_STATUS} value={r.status} /> },
  ];

  const setView = (v: string) => { const p = new URLSearchParams(sp.toString()); p.set("view", v); router.replace(`/admin/shops?${p}`); };
  const count = (v: View) => all.filter((r) => (v === "attention" ? r.status === "MEMO_OVERDUE" : v === "unassigned" ? !r.assignedAgent : v === "dormant" ? r.status === "DORMANT" || r.status === "NEW" : true)).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar icon={StoreIcon} iconClass={OBJECT_TINT.shops} title="Shops" info="Every retailer your agents visit: who covers it, what is outstanding and which samples are sitting there.">
        <Btn variant="primary" icon={PlusIcon} onClick={() => setCreating(true)}>New shop</Btn>
      </TitleBar>
      <ViewBar right={shops.data && <span className="hidden text-[13px] text-ink-2 sm:inline"><span className="num font-medium text-gold-ink">{formatINRCompact(sum(all, (r) => r.samplesHereValuePaise))}</span> in samples at <span className="num">{all.filter((r) => r.samplesHereCount).length}</span> shops</span>}>
        <ViewTabs value={view} onChange={setView} items={[
          { value: "all", label: "All shops", count: all.length },
          { value: "attention", label: "Memo overdue", count: count("attention") },
          { value: "unassigned", label: "Unassigned", count: count("unassigned") },
          { value: "dormant", label: "Not visited", count: count("dormant") },
        ]} />
      </ViewBar>
      <FilterBar right={<SearchInput value={q} onChange={setQ} placeholder="Search shop, area, owner" />}>
        <SortChip value={sort} options={SORTS} onChange={setSort} />
        <span className="mx-0.5 h-4 w-px bg-line" />
        <FilterChip label="Agent" value={agent} onChange={setAgent} icon={UserIcon} options={[{ value: "all", label: "Any agent" }, { value: "none", label: "Unassigned" }, ...(agents.data ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
        <FilterChip label="Status" value={status} onChange={setStatus} icon={CircleDotIcon} options={[{ value: "all", label: "Any status" }, ...Object.entries(SHOP_STATUS).map(([v, [, l]]) => ({ value: v, label: l }))]} />
        <FilterChip label="Area" value={area} onChange={setArea} icon={MapPinIcon} options={[{ value: "all", label: "Any area" }, ...areas.map((a) => ({ value: a, label: a }))]} />
      </FilterBar>
      {shops.isLoading ? <RowsSkeleton /> : shops.error ? <QueryError error={shops.error} retry={() => shops.refetch()} /> : (
        <DataTable
          key={sort}
          data={rows}
          columns={columns}
          fit
          getRowId={(r) => r.id}
          onOpen={(r) => router.push(`/admin/shops/${r.id}`)}
          countLabel="shops"
          empty={all.length
            ? <Empty icon={StoreIcon} title="No shops match" hint="Change the view or clear a filter." action={<Btn onClick={() => { setQ(""); setAgent("all"); setStatus("all"); setArea("all"); setView("all"); }}>Clear filters</Btn>} />
            : <Empty icon={StoreIcon} title="No shops yet" hint="Add your first retailer with its location so agents can check in there." action={<Btn icon={PlusIcon} onClick={() => setCreating(true)}>New shop</Btn>} />}
          bulkActions={(sel, clear) => <BulkAssign shops={sel} agents={(agents.data ?? []).filter((a) => a.active)} onDone={clear} />}
        />
      )}
      <ShopSheet open={creating} onOpenChange={setCreating} onSaved={(id) => router.push(`/admin/shops/${id}`)} />
    </div>
  );
}

const FooterSum = ({ v, gold }: { v: number; gold?: boolean }) => (v ? <span className="num"><span className="text-ink-3">Sum </span><span className={gold ? "font-medium text-gold-ink" : "font-medium text-ink"}>{formatINRCompact(v)}</span></span> : null);

/** Bulk "Assign agent": PATCH each selected shop, then one sync. */
function BulkAssign({ shops, agents, onDone }: { shops: ShopRow[]; agents: { id: string; name: string }[]; onDone: () => void }) {
  const sync = useSync();
  const m = useMutation({
    mutationFn: async (agentId: string | null) => {
      const res = await Promise.allSettled(shops.map((s) => api(`/admin/shops/${s.id}`, { method: "PATCH", body: { assignedAgentId: agentId } })));
      const failed = res.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      if (failed.length) throw new Error(`${failed.length} of ${shops.length} not updated: ${errMsg(failed[0].reason)}`);
      return agentId;
    },
    onSuccess: (agentId) => {
      toast.success(agentId ? `${shops.length} shop${shops.length > 1 ? "s" : ""} assigned to ${agents.find((a) => a.id === agentId)?.name}` : `${shops.length} shop${shops.length > 1 ? "s" : ""} unassigned`);
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
    onSettled: () => sync("shop.saved", "agent.saved"),
  });
  return (
    <label className="relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink hover:bg-hover">
      <UserPlusIcon className="size-4 text-ink-2" />{m.isPending ? "Assigning…" : "Assign agent"}
      <select value="" disabled={m.isPending} onChange={(e) => m.mutate(e.target.value === "__none" ? null : e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Assign agent">
        <option value="" disabled>Assign to…</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        <option value="__none">Remove assignment</option>
      </select>
    </label>
  );
}
