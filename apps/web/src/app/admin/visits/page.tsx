"use client";
/** Visits — REFERENCE IMPLEMENTATION of an Attio list page (TitleBar → ViewBar → FilterBar → DataTable).
 *  Other list pages follow this structure exactly. */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, CameraIcon, ClockIcon, MapPinIcon, MapPinnedIcon, PlusIcon, RulerIcon, StoreIcon, UserIcon, ActivityIcon, CircleDotIcon, ReceiptTextIcon } from "lucide-react";
import { addDays, istDate, formatINRCompact } from "@jewelroute/shared";
import { api } from "@/lib/api";
import { qk } from "@/lib/sync";
import type { VisitSummary, Verification, VisitStatus } from "@/lib/types";
import { Avatar, Btn, Dot, Empty, FilterBar, FilterChip, RowsSkeleton, SearchInput, TitleBar, ViewBar, ViewTabs, type Tone } from "@/components/app/chrome";
import { DataTable, Muted, NameCell, type Col } from "@/components/app/data-table";
import { OBJECT_TINT } from "@/components/app/shell";
import { AssignVisitDialog } from "@/components/admin-v2/field/dialogs";

type ProofState = "VERIFIED" | "LOW_ACCURACY" | "SIMULATED" | "MISSING" | "NOT_STARTED";
type Row = VisitSummary & {
  agent: { id: string; name: string };
  plannedTime?: string;
  durationMin?: number;
  proofState?: ProofState;
  outcome?: { orderCount: number; orderValuePaise: number; memoCount: number; memoValuePaise: number; returnedCount: number };
};

const STATUS: Record<VisitStatus, [Tone, string]> = {
  PLANNED: ["grey", "Planned"], CHECKED_IN: ["blue", "Checked in"], ACTIVE: ["blue", "In visit"],
  COMPLETED: ["green", "Completed"], MISSED: ["red", "Missed"], CANCELLED: ["grey", "Cancelled"],
};
const PROOF: Record<ProofState, [Tone, string]> = {
  VERIFIED: ["green", "Verified"], LOW_ACCURACY: ["amber", "Low GPS accuracy"], SIMULATED: ["blue", "Simulated"],
  MISSING: ["red", "Missing"], NOT_STARTED: ["grey", "—"],
};
const proofOf = (r: Row): ProofState =>
  r.proofState ?? (r.status === "PLANNED" ? "NOT_STARTED" : r.proofCount > 0 ? ((r.verification as Verification) ?? "VERIFIED") : "MISSING");
const istTime = (iso?: string) => (iso ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).toLowerCase() : undefined);
const fmtDist = (m?: number) => (m == null ? undefined : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

function VisitsBody() {
  const sp = useSearchParams(); const router = useRouter();
  const today = istDate();
  const view = (sp.get("view") as "today" | "yesterday" | "week") ?? "today";
  const [q, setQ] = React.useState("");
  const [agent, setAgent] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [proof, setProof] = React.useState("all");
  const [assigning, setAssigning] = React.useState(false);

  const range = view === "today" ? { date: today } : view === "yesterday" ? { date: addDays(today, -1) } : { from: addDays(today, -6), to: today };
  const qs = new URLSearchParams(Object.entries(range) as [string, string][]);
  const visits = useQuery({ queryKey: [...qk.adminVisits, range], queryFn: () => api<Row[]>(`/admin/visits?${qs}`), refetchInterval: 15_000 });
  const agents = useQuery({ queryKey: qk.agents, queryFn: () => api<{ id: string; name: string }[]>("/admin/agents") });

  const rows = (visits.data ?? []).filter((r) =>
    (agent === "all" || r.agent?.id === agent) &&
    (status === "all" || r.status === status) &&
    (proof === "all" || proofOf(r) === proof) &&
    (!q || `${r.shop.name} ${r.shop.area} ${r.agent?.name}`.toLowerCase().includes(q.toLowerCase())),
  );

  const columns: Col<Row>[] = [
    {
      id: "shop", header: "Shop", accessorFn: (r) => r.shop.name, meta: { icon: StoreIcon, width: 196 },
      cell: ({ row: { original: r } }) => <NameCell lead={<Avatar name={r.shop.name} size={20} square />} name={r.shop.name} />,
    },
    // Status sits next to Shop: it is the column people verify, so it must never fall behind horizontal scroll.
    { id: "status", header: "Status", accessorFn: (r) => r.status, meta: { icon: CircleDotIcon, width: 118 }, cell: ({ row: { original: r } }) => <Dot tone={STATUS[r.status][0]}>{STATUS[r.status][1]}</Dot> },
    { id: "agent", header: "Agent", accessorFn: (r) => r.agent?.name, meta: { icon: UserIcon, width: 132 }, cell: ({ row: { original: r } }) => <span className="flex min-w-0 items-center gap-2"><Avatar name={r.agent?.name ?? "?"} /><span className="truncate">{r.agent?.name}</span></span> },
    { id: "area", header: "Area", accessorFn: (r) => r.shop.area, meta: { icon: MapPinIcon, width: 112 } },
    { id: "planned", header: "Planned", accessorFn: (r) => `${r.plannedDate} ${r.plannedTime ?? ""}`, meta: { icon: CalendarIcon, width: 88 }, cell: ({ row: { original: r } }) => <span className="num">{view === "week" ? `${r.plannedDate.slice(8)}/${r.plannedDate.slice(5, 7)} ` : ""}{r.plannedTime ?? <Muted>#{r.sequence}</Muted>}</span> },
    { id: "checkin", header: "Check-in", accessorFn: (r) => r.checkInAt ?? "", meta: { icon: ClockIcon, width: 88 }, cell: ({ row: { original: r } }) => (r.checkInAt ? <span className="num">{istTime(r.checkInAt)}</span> : <Muted />) },
    { id: "distance", header: "Distance", accessorFn: (r) => r.checkInDistanceM ?? -1, meta: { icon: RulerIcon, width: 84, align: "right" }, cell: ({ row: { original: r } }) => (r.checkInDistanceM != null ? <span className="num">{fmtDist(r.checkInDistanceM)}</span> : <Muted />) },
    { id: "proof", header: "Proof", accessorFn: (r) => proofOf(r), meta: { icon: CameraIcon, width: 124 }, cell: ({ row: { original: r } }) => { const p = proofOf(r); return p === "NOT_STARTED" ? <Muted /> : <Dot tone={PROOF[p][0]}>{PROOF[p][1]}</Dot>; } },
    { id: "duration", header: "Duration", accessorFn: (r) => r.durationMin ?? -1, meta: { icon: ActivityIcon, width: 84, align: "right" }, cell: ({ row: { original: r } }) => (r.durationMin != null ? <span className="num">{r.durationMin} min</span> : <Muted />) },
    {
      id: "outcome", header: "Outcome", accessorFn: (r) => r.outcome?.orderValuePaise ?? r.orderCount, meta: { icon: ReceiptTextIcon, width: 120 },
      cell: ({ row: { original: r } }) => {
        const o = r.outcome; const parts: string[] = [];
        if (o?.orderCount ?? r.orderCount) parts.push(o ? `Order ${formatINRCompact(o.orderValuePaise)}` : `${r.orderCount} order${r.orderCount > 1 ? "s" : ""}`);
        if (o?.memoCount) parts.push(`Memo ${formatINRCompact(o.memoValuePaise)}`);
        if (o?.returnedCount) parts.push(`${o.returnedCount} returned`);
        return parts.length ? <span className="truncate">{parts.join(" · ")}</span> : <Muted />;
      },
    },
  ];

  const setView = (v: string) => { const p = new URLSearchParams(sp.toString()); p.set("view", v); router.replace(`/admin/visits?${p}`); };
  const done = rows.filter((r) => r.status === "COMPLETED").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar icon={MapPinnedIcon} iconClass={OBJECT_TINT.visits} title="Visits" info="Every planned and completed shop visit, with server-verified GPS and photo proof.">
        <Btn variant="primary" icon={PlusIcon} onClick={() => setAssigning(true)}>Assign visit</Btn>
      </TitleBar>
      <ViewBar right={<span className="text-[13px] text-ink-2"><span className="num font-medium text-ink">{done}</span> of <span className="num">{rows.length}</span> completed</span>}>
        <ViewTabs value={view} onChange={setView} items={[{ value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "week", label: "Last 7 days" }]} />
      </ViewBar>
      <FilterBar right={<SearchInput value={q} onChange={setQ} placeholder="Search shop, area, agent" />}>
        <FilterChip label="Agent" value={agent} onChange={setAgent} options={[{ value: "all", label: "All agents" }, ...(agents.data ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
        <FilterChip label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, ...Object.entries(STATUS).map(([v, [, l]]) => ({ value: v, label: l }))]} />
        <FilterChip label="Proof" value={proof} onChange={setProof} options={[{ value: "all", label: "Any proof" }, ...Object.entries(PROOF).filter(([v]) => v !== "NOT_STARTED").map(([v, [, l]]) => ({ value: v, label: l }))]} />
      </FilterBar>
      {visits.isLoading ? <RowsSkeleton /> : (
        <DataTable
          data={rows}
          columns={columns}
          fit
          getRowId={(r) => r.id}
          onOpen={(r) => router.push(`/admin/visits/${r.id}`)}
          countLabel="visits"
          initialSort={[{ id: "planned", desc: false }]}
          empty={<Empty icon={MapPinnedIcon} title="No visits match" hint="Change the view or filters, or assign a shop to an agent." action={<Btn icon={PlusIcon} onClick={() => setAssigning(true)}>Assign visit</Btn>} />}
          bulkActions={(sel, clear) => <Btn variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(sel.map((s) => `${s.shop.name}\t${s.agent?.name}\t${s.status}`).join("\n")); clear(); }}>Copy rows</Btn>}
        />
      )}
      <AssignVisitDialog open={assigning} onOpenChange={setAssigning} />
    </div>
  );
}

export default function VisitsPage() {
  return <React.Suspense fallback={<RowsSkeleton />}><VisitsBody /></React.Suspense>;
}
