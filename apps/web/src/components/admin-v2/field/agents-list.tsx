"use client";
/** Agents — Attio list page; same structure as Visits/Shops. */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useUrlSort, useUrlState } from "@/lib/url-state";
import { CircleDotIcon, ClockIcon, GemIcon, MapPinnedIcon, PlusIcon, ReceiptTextIcon, ScrollTextIcon, TrendingUpIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { formatINRCompact, istDate } from "@jewelroute/shared";
import { Avatar, Btn, Empty, FilterBar, RowsSkeleton, SearchInput, TitleBar, ViewBar, ViewTabs, type Tone } from "@/components/app/chrome";
import { RecordPreview, usePreview } from "@/components/app/record-preview";
import { AgentPreview } from "@/components/admin-v2/previews";
import { DataTable, Muted, NameCell, type Col } from "@/components/app/data-table";
import { OBJECT_TINT } from "@/components/app/shell";
import { useAgentRows, type AgentRow } from "./data";
import { AddAgentDialog, AssignVisitDialog } from "./dialogs";
import { QueryError, StatusDot, istTime, relDay, wallTime } from "./ui";

type AgentState = "IN_VISIT" | "ON_ROUTE" | "DONE" | "NO_ROUTE" | "INACTIVE";
export const AGENT_STATE: Record<AgentState, [Tone, string]> = {
  IN_VISIT: ["blue", "In visit"], ON_ROUTE: ["green", "On route"], DONE: ["grey", "Route done"], NO_ROUTE: ["grey", "No route today"], INACTIVE: ["red", "Inactive"],
};
export function agentState(a: { active: boolean; currentVisit?: unknown; today: { planned: number; completed: number; inProgress?: number } }): AgentState {
  if (!a.active) return "INACTIVE";
  if (a.currentVisit || a.today.inProgress) return "IN_VISIT";
  if (!a.today.planned) return "NO_ROUTE";
  return a.today.completed >= a.today.planned ? "DONE" : "ON_ROUTE";
}
/** "1:22 pm" today, else "20 Oct, 1:22 pm". */
const sinceLabel = (iso: string) => (istDate(new Date(iso)) === istDate() ? istTime(iso) : relDay(iso));
const sum = (rows: AgentRow[], f: (r: AgentRow) => number) => rows.reduce((a, r) => a + f(r), 0);

export function AgentsList() {
  const router = useRouter();
  const preview = usePreview();
  const [viewRaw, setView] = useUrlState("view", "all");
  const view = (["all", "field", "inactive"].includes(viewRaw) ? viewRaw : "all") as "all" | "field" | "inactive";
  const [q, setQ] = useUrlState("q");
  const [sorting, setSorting] = useUrlSort([{ id: "status", desc: false }]);
  const [assign, setAssign] = React.useState<string | undefined>();
  const [adding, setAdding] = React.useState(false);
  const agents = useAgentRows();
  const all = agents.data ?? [];
  const rows = all.filter((a) =>
    (view === "all" ? a.active : view === "field" ? a.active && a.today.planned > a.today.completed : !a.active) &&
    (!q || `${a.name} ${a.email} ${a.homeArea ?? ""} ${a.currentVisit?.shopName ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );

  const columns: Col<AgentRow>[] = [
    { id: "agent", header: "Agent", accessorFn: (r) => r.name, meta: { icon: UsersIcon, width: 150 }, cell: ({ row: { original: r } }) => <NameCell lead={<Avatar name={r.name} size={20} />} name={r.name} /> },
    {
      id: "progress", header: "Today progress", accessorFn: (r) => (r.today.planned ? r.today.completed / r.today.planned : -1), meta: { icon: TrendingUpIcon, width: 140 },
      cell: ({ row: { original: r } }) => r.today.planned ? (
        <span className="flex w-full items-center gap-2.5">
          <span className="num w-9 shrink-0">{r.today.completed}/{r.today.planned}</span>
          <span className="flex h-1.5 w-20 overflow-hidden rounded-full bg-hover"><span className="bg-verified" style={{ width: `${(r.today.completed / r.today.planned) * 100}%` }} />{r.today.inProgress > 0 && <span className="bg-blue/60" style={{ width: `${(r.today.inProgress / r.today.planned) * 100}%` }} />}</span>
        </span>
      ) : <Muted>No route</Muted>,
    },
    {
      id: "current", header: "Current visit", accessorFn: (r) => r.currentVisit?.shopName ?? "", meta: { icon: MapPinnedIcon, width: 248 },
      cell: ({ row: { original: r } }) => (r.currentVisit
        ? <span className="flex min-w-0 items-baseline gap-1.5"><span className="truncate">{r.currentVisit.shopName}</span><span className="num shrink-0 text-[12.5px] text-ink-3">since {sinceLabel(r.currentVisit.since)}</span></span>
        : r.nextVisit ? <span className="truncate text-ink-3">Next: {r.nextVisit.shopName}{r.nextVisit.plannedTime ? ` · ${wallTime(r.nextVisit.plannedTime)}` : ""}</span> : <Muted />),
    },
    {
      id: "bag", header: "Bag value", accessorFn: (r) => r.bag.valuePaise, meta: { icon: GemIcon, width: 120, align: "right", footer: <Sum v={sum(rows, (r) => r.bag.valuePaise)} gold /> },
      cell: ({ row: { original: r } }) => (r.bag.count ? <span className="num"><span className="text-ink-3">{r.bag.count} · </span><span className="text-gold-ink">{formatINRCompact(r.bag.valuePaise)}</span></span> : <Muted>Empty</Muted>),
    },
    {
      id: "memos", header: "Open memos", accessorFn: (r) => r.openMemos.valuePaise, meta: { icon: ScrollTextIcon, width: 124, align: "right", footer: <Sum v={sum(rows, (r) => r.openMemos.valuePaise)} gold /> },
      cell: ({ row: { original: r } }) => (r.openMemos.count ? <span className="num inline-flex items-center gap-1.5">{r.openMemos.overdueCount > 0 && <span className="size-1.5 rounded-full bg-danger" title={`${r.openMemos.overdueCount} overdue`} />}<span className="text-ink-3">{r.openMemos.count} · </span><span className="text-gold-ink">{formatINRCompact(r.openMemos.valuePaise)}</span></span> : <Muted />),
    },
    {
      id: "orders", header: "Orders today", accessorFn: (r) => r.ordersToday.valuePaise, meta: { icon: ReceiptTextIcon, width: 130, align: "right", footer: <Sum v={sum(rows, (r) => r.ordersToday.valuePaise)} /> },
      cell: ({ row: { original: r } }) => (r.ordersToday.count ? <span className="num"><span className="text-ink-3">{r.ordersToday.count} · </span>{formatINRCompact(r.ordersToday.valuePaise)}</span> : <Muted />),
    },
    { id: "lastCheckIn", header: "Last check-in", accessorFn: (r) => r.lastCheckInAt ?? "", meta: { icon: ClockIcon, width: 144 }, cell: ({ row: { original: r } }) => (r.lastCheckInAt ? <span className="num">{relDay(r.lastCheckInAt)}</span> : <Muted>Never</Muted>) },
    { id: "status", header: "Status", accessorFn: (r) => agentState(r), meta: { icon: CircleDotIcon, width: 124 }, cell: ({ row: { original: r } }) => <StatusDot map={AGENT_STATE} value={agentState(r)} /> },
  ];

  const active = all.filter((a) => a.active);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar icon={UsersIcon} iconClass={OBJECT_TINT.agents} title="Agents" info="Field agents: today's route progress, the samples in their bag and the memos they own.">
        <Btn icon={UserPlusIcon} onClick={() => setAdding(true)}>Add agent</Btn>
        <Btn variant="primary" icon={PlusIcon} onClick={() => setAssign("")}>Assign visit</Btn>
      </TitleBar>
      <ViewBar right={agents.data && <span className="hidden text-[13px] text-ink-2 sm:inline"><span className="num font-medium text-ink">{sum(active, (a) => a.today.completed)}</span> of <span className="num">{sum(active, (a) => a.today.planned)}</span> visits done today</span>}>
        <ViewTabs value={view} onChange={setView} items={[
          { value: "all", label: "Active agents", count: active.length },
          { value: "field", label: "Still on route", count: active.filter((a) => a.today.planned > a.today.completed).length },
          { value: "inactive", label: "Inactive", count: all.length - active.length },
        ]} />
      </ViewBar>
      <FilterBar right={<SearchInput value={q} onChange={setQ} placeholder="Search agent, area, shop" />} />
      {agents.isLoading ? <RowsSkeleton rows={4} /> : agents.error ? <QueryError error={agents.error} retry={() => agents.refetch()} /> : (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          onOpen={(r) => router.push(`/admin/agents/${r.id}`)}
          onPreview={(r) => preview.open(r.id)}
          activeId={preview.id}
          onOrderChange={preview.setOrder}
          countLabel="agents"
          fit
          selectable={false}
          sorting={sorting}
          onSortingChange={setSorting}
          empty={<Empty icon={UsersIcon} title={view === "inactive" ? "No inactive agents" : "No agents match"} hint={view === "inactive" ? "Deactivated agents keep their history and show up here." : "Clear the search, or add an agent."} />}
        />
      )}
      <AddAgentDialog open={adding} onOpenChange={setAdding} onCreated={(id) => router.push(`/admin/agents/${id}`)} />
      <RecordPreview state={preview} viewLabel="Agents" href={preview.id ? `/admin/agents/${preview.id}` : undefined}>
        {preview.id && <AgentPreview id={preview.id} />}
      </RecordPreview>
      <AssignVisitDialog open={assign !== undefined} onOpenChange={(o) => !o && setAssign(undefined)} agentId={assign || undefined} />
    </div>
  );
}
const Sum = ({ v, gold }: { v: number; gold?: boolean }) => (v ? <span className="num"><span className="text-ink-3">Sum </span><span className={gold ? "font-medium text-gold-ink" : "font-medium text-ink"}>{formatINRCompact(v)}</span></span> : null);
