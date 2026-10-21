"use client";
/** Memos — Attio list page. Overdue is obvious but quiet: a red dot and "3 days overdue", no row fills. */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClockIcon, CalendarIcon, CircleDotIcon, GemIcon, HashIcon, IndianRupeeIcon, ScrollTextIcon, ShieldCheckIcon, StoreIcon, UserIcon } from "lucide-react";
import { formatINR, formatINRCompact } from "@jewelroute/shared";
import type { MemoRow } from "@/lib/types";
import { Avatar, Empty, FilterBar, FilterChip, RowsSkeleton, SearchInput, TitleBar, ViewBar, ViewTabs } from "@/components/app/chrome";
import { DataTable, NameCell, type Col } from "@/components/app/data-table";
import { OBJECT_TINT } from "@/components/app/shell";
import { useMemos } from "@/components/admin-v2/sales/data";
import { DueText, ErrorState, fmtDay, MemoStatusDot, RowIcon, useHydrated } from "@/components/admin-v2/sales/ui";

type View = "active" | "due_today" | "overdue" | "returned" | "all";
const isOpen = (m: MemoRow) => m.status === "ACTIVE" || m.status === "PARTIALLY_RETURNED";
const IN_VIEW: Record<View, (m: MemoRow) => boolean> = {
  active: isOpen,
  due_today: (m) => isOpen(m) && m.daysToDue === 0,
  overdue: (m) => isOpen(m) && m.daysToDue < 0,
  returned: (m) => m.status === "RETURNED" || m.status === "CONVERTED_TO_ORDER",
  all: () => true,
};

function MemosBody() {
  const sp = useSearchParams(); const router = useRouter();
  const v = sp.get("view");
  const view: View = v && v in IN_VIEW ? (v as View) : "active";
  const [q, setQ] = React.useState("");
  const [agent, setAgent] = React.useState("all");
  const [shop, setShop] = React.useState("all");
  const [ack, setAck] = React.useState("all");
  const memos = useMemos();
  const all = React.useMemo(() => memos.data ?? [], [memos.data]);

  const uniq = <K extends "agent" | "shop">(k: K) => [...new Map(all.map((m) => [m[k].id, m[k].name])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  const s = q.trim().toLowerCase();
  const rows = all.filter((m) =>
    IN_VIEW[view](m) && (agent === "all" || m.agent.id === agent) && (shop === "all" || m.shop.id === shop) && (ack === "all" || m.ackStatus === ack) &&
    (!s || `${m.number} ${m.shop.name} ${m.shop.area ?? ""} ${m.agent.name} ${m.items.map((i) => i.piece.tagCode).join(" ")}`.toLowerCase().includes(s)),
  );
  const total = rows.reduce((a, m) => a + m.totalValuePaise, 0);
  const open = all.filter(isOpen);
  const overdue = open.filter((m) => m.daysToDue < 0);

  const columns: Col<MemoRow>[] = [
    { id: "number", header: "Memo", accessorFn: (m) => m.number, meta: { icon: HashIcon, width: 190 }, cell: ({ row: { original: m } }) => <NameCell lead={<RowIcon icon={ScrollTextIcon} />} name={<span className="num">{m.number}</span>} /> },
    { id: "shop", header: "Retailer", accessorFn: (m) => m.shop.name, meta: { icon: StoreIcon, width: 220 }, cell: ({ row: { original: m } }) => <span className="flex min-w-0 items-center gap-2"><Avatar name={m.shop.name} square />{m.shop.name}{m.shop.area && <span className="truncate text-[13px] text-ink-3">{m.shop.area}</span>}</span> },
    { id: "agent", header: "Agent", accessorFn: (m) => m.agent.name, meta: { icon: UserIcon, width: 140 }, cell: ({ row: { original: m } }) => <span className="flex items-center gap-2"><Avatar name={m.agent.name} />{m.agent.name}</span> },
    {
      id: "pieces", header: "Pieces", accessorFn: (m) => m.pieceCount, meta: { icon: GemIcon, width: 90, align: "right" },
      cell: ({ row: { original: m } }) => {
        const out = m.outstandingCount ?? m.items.filter((i) => i.status === "OUT").length;
        return <span className="num">{out !== m.pieceCount && isOpen(m) ? <><span className="text-ink">{out}</span><span className="text-ink-3"> of {m.pieceCount}</span></> : m.pieceCount}</span>;
      },
    },
    {
      id: "value", header: "Total value", accessorFn: (m) => m.totalValuePaise, meta: { icon: IndianRupeeIcon, width: 130, align: "right", footer: rows.length ? <span className="num font-medium text-gold-ink">{formatINRCompact(total)}</span> : undefined },
      cell: ({ row: { original: m } }) => <span className="num font-medium text-gold-ink">{formatINR(m.totalValuePaise)}</span>,
    },
    { id: "issued", header: "Issued", accessorFn: (m) => m.issuedAt, meta: { icon: CalendarIcon, width: 90 }, cell: ({ row: { original: m } }) => <span className="num">{fmtDay(m.issuedAt)}</span> },
    {
      id: "due", header: "Due", accessorFn: (m) => m.dueDate, meta: { icon: CalendarClockIcon, width: 175 },
      cell: ({ row: { original: m } }) => <span className="flex items-baseline gap-2"><span className="num">{fmtDay(m.dueDate)}</span><DueText days={m.daysToDue} open={isOpen(m)} />{m.extended && <span className="text-[12px] text-ink-3">extended</span>}</span>,
    },
    { id: "status", header: "Status", accessorFn: (m) => m.displayStatus, meta: { icon: CircleDotIcon, width: 150 }, cell: ({ row: { original: m } }) => <MemoStatusDot status={m.displayStatus} /> },
  ];

  const setView = (nv: string) => { const p = new URLSearchParams(sp.toString()); p.set("view", nv); router.replace(`/admin/memos?${p}`); };
  const count = (vv: View) => all.filter(IN_VIEW[vv]).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar icon={ScrollTextIcon} iconClass={OBJECT_TINT.memos} title="Memos" info="Pieces left with retailers on approval. Each memo lists the exact tagged pieces, and every hand-over is written to the custody ledger." />
      <ViewBar right={memos.data && (
        <span className="hidden items-center gap-3 text-[13px] text-ink-2 sm:flex">
          <span><span className="num font-medium text-gold-ink">{formatINRCompact(open.reduce((a, m) => a + m.outstandingValuePaise, 0))}</span> outstanding</span>
          {overdue.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-danger" /><span className="num font-medium text-ink">{overdue.length}</span> overdue · <span className="num">{formatINRCompact(overdue.reduce((a, m) => a + m.outstandingValuePaise, 0))}</span></span>}
        </span>
      )}>
        <ViewTabs value={view} onChange={setView} items={[
          { value: "active", label: "All active", count: memos.data ? count("active") : undefined },
          { value: "due_today", label: "Due today", count: memos.data ? count("due_today") : undefined },
          { value: "overdue", label: "Overdue", count: memos.data ? count("overdue") : undefined },
          { value: "returned", label: "Returned", count: memos.data ? count("returned") : undefined },
        ]} />
      </ViewBar>
      <FilterBar right={<SearchInput value={q} onChange={setQ} placeholder="Search memo, retailer, tag code" />}>
        <FilterChip label="Agent" icon={UserIcon} value={agent} onChange={setAgent} options={[{ value: "all", label: "All agents" }, ...uniq("agent")]} />
        <FilterChip label="Retailer" icon={StoreIcon} value={shop} onChange={setShop} options={[{ value: "all", label: "All retailers" }, ...uniq("shop")]} />
        <FilterChip label="Acknowledged" icon={ShieldCheckIcon} value={ack} onChange={setAck} options={[{ value: "all", label: "Any" }, { value: "ACKNOWLEDGED", label: "Acknowledged" }, { value: "PENDING", label: "Pending" }]} />
      </FilterBar>
      {memos.error ? <ErrorState error={memos.error} retry={() => memos.refetch()} /> : memos.isLoading ? <RowsSkeleton /> : (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(m) => m.id}
          onOpen={(m) => router.push(`/admin/memos/${m.id}`)}
          selectable={false}
          countLabel="memos"
          initialSort={[{ id: "due", desc: view === "returned" }]}
          empty={<Empty icon={ScrollTextIcon} title={view === "overdue" ? "Nothing overdue" : view === "due_today" ? "Nothing due today" : "No memos match"} hint={all.length ? "Change the view or clear the filters." : "Memos appear when an agent leaves pieces with a retailer during a visit."} />}
        />
      )}
    </div>
  );
}

function MemosInner() {
  const hydrated = useHydrated();
  return hydrated ? <MemosBody /> : <RowsSkeleton />;
}

export default function MemosPage() {
  return <React.Suspense fallback={<RowsSkeleton />}><MemosInner /></React.Suspense>;
}
