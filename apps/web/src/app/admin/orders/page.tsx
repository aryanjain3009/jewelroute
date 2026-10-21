"use client";
/** Orders — Attio list page (TitleBar → ViewBar → FilterBar → DataTable), modelled on /admin/visits. */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon, CheckIcon, CircleDotIcon, CoinsIcon, HashIcon, IndianRupeeIcon, ReceiptTextIcon, StoreIcon, UserIcon } from "lucide-react";
import { addDays, formatINR, formatINRCompact, formatRate, istDate, PURITY_LABEL } from "@jewelroute/shared";
import { api } from "@/lib/api";
import type { Order } from "@/lib/types";
import { Avatar, Btn, Dot, Empty, FilterBar, FilterChip, RowsSkeleton, SearchInput, TitleBar, ViewBar, ViewTabs } from "@/components/app/chrome";
import { DataTable, Muted, NameCell, type Col } from "@/components/app/data-table";
import { OBJECT_TINT } from "@/components/app/shell";
import { useOrders, useWrite } from "@/components/admin-v2/sales/data";
import { ErrorState, fmtDayTime, Modal, OrderStatusDot, RowIcon, useHydrated } from "@/components/admin-v2/sales/ui";

type View = "all" | "pending" | "approved" | "rejected";
type BatchResult = { id: string; ok: boolean; number?: string; status?: string; error?: { code: string; message: string } };
type BatchApprove = { results: BatchResult[]; approved: number; failed: number };
const VIEW_STATUS: Record<View, Order["status"] | null> = { all: null, pending: "SUBMITTED", approved: "APPROVED", rejected: "REJECTED" };

function OrdersBody() {
  const sp = useSearchParams(); const router = useRouter();
  const view = (["all", "pending", "approved", "rejected"].includes(sp.get("view") ?? "") ? sp.get("view") : "all") as View;
  const [q, setQ] = React.useState("");
  const [agent, setAgent] = React.useState("all");
  const [shop, setShop] = React.useState("all");
  const [when, setWhen] = React.useState("all");
  const [confirm, setConfirm] = React.useState<{ rows: Order[]; clear: () => void } | null>(null);
  const orders = useOrders();
  const all = React.useMemo(() => orders.data ?? [], [orders.data]);
  const today = istDate();

  const uniq = <K extends "agent" | "shop">(k: K) => [...new Map(all.map((o) => [o[k].id, o[k].name])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  const count = (v: View) => (VIEW_STATUS[v] ? all.filter((o) => o.status === VIEW_STATUS[v]).length : all.length);
  const s = q.trim().toLowerCase();
  const rows = all.filter((o) =>
    (!VIEW_STATUS[view] || o.status === VIEW_STATUS[view]) &&
    (agent === "all" || o.agent.id === agent) && (shop === "all" || o.shop.id === shop) &&
    (when === "all" || (when === "today" ? istDate(new Date(o.createdAt)) === today : istDate(new Date(o.createdAt)) >= addDays(today, -6))) &&
    (!s || `${o.number} ${o.shop.name} ${o.shop.area ?? ""} ${o.agent.name}`.toLowerCase().includes(s)),
  );
  const total = rows.reduce((a, o) => a + o.totalPaise, 0);
  const pending = all.filter((o) => o.status === "SUBMITTED");

  // One batch call; every order is approved in its own transaction and reported on its own.
  const [results, setResults] = React.useState<Map<string, BatchResult> | null>(null);
  const closeConfirm = () => { setConfirm(null); setResults(null); };
  const approve = useWrite(
    (list: Order[]) => api<BatchApprove>("/admin/orders/approve", { body: { orderIds: list.map((o) => o.id) } }),
    {
      changes: ["order.decided"],
      success: (r) => `${r.approved} order${r.approved === 1 ? "" : "s"} approved${r.failed ? ` · ${r.failed} not approved` : ""}`,
      onSuccess: (r) => {
        if (!r.failed) { confirm?.clear(); closeConfirm(); return; }
        setResults(new Map(r.results.map((x) => [x.id, x])));
      },
    },
  );

  const columns: Col<Order>[] = [
    {
      id: "number", header: "Order", accessorFn: (o) => o.number, meta: { icon: HashIcon, width: 190 },
      cell: ({ row: { original: o } }) => <NameCell lead={<RowIcon icon={ReceiptTextIcon} />} name={<span className="num">{o.number}</span>} />,
    },
    { id: "shop", header: "Shop", accessorFn: (o) => o.shop.name, meta: { icon: StoreIcon, width: 230 }, cell: ({ row: { original: o } }) => <span className="flex min-w-0 items-center gap-2"><Avatar name={o.shop.name} square />{o.shop.name}{o.shop.area && <span className="truncate text-[13px] text-ink-3">{o.shop.area}</span>}</span> },
    { id: "agent", header: "Agent", accessorFn: (o) => o.agent.name, meta: { icon: UserIcon, width: 150 }, cell: ({ row: { original: o } }) => <span className="flex items-center gap-2"><Avatar name={o.agent.name} />{o.agent.name}</span> },
    { id: "created", header: "Created", accessorFn: (o) => o.createdAt, meta: { icon: CalendarIcon, width: 140 }, cell: ({ row: { original: o } }) => <span className="num">{fmtDayTime(o.createdAt)}</span> },
    {
      id: "amount", header: "Amount", accessorFn: (o) => o.totalPaise, meta: { icon: IndianRupeeIcon, width: 130, align: "right", footer: rows.length ? <span className="num font-medium text-gold-ink">{formatINRCompact(total)}</span> : undefined },
      cell: ({ row: { original: o } }) => <span className="num font-medium text-gold-ink">{formatINR(o.totalPaise)}</span>,
    },
    {
      id: "rate", header: "Gold rate", accessorFn: (o) => o.goldRateSnapshot[0]?.ratePaisePerGram ?? 0, meta: { icon: CoinsIcon, width: 150 },
      cell: ({ row: { original: o } }) => {
        const r = o.goldRateSnapshot[0];
        if (!r) return <Muted />;
        return <span className="num">{PURITY_LABEL[r.purity]} {formatRate(r.ratePaisePerGram)}{o.goldRateSnapshot.length > 1 && <span className="text-ink-3"> +{o.goldRateSnapshot.length - 1}</span>}</span>;
      },
    },
    { id: "status", header: "Status", accessorFn: (o) => o.status, meta: { icon: CircleDotIcon, width: 180 }, cell: ({ row: { original: o } }) => <OrderStatusDot status={o.status} /> },
  ];

  const setView = (v: string) => { const p = new URLSearchParams(sp.toString()); p.set("view", v); router.replace(`/admin/orders?${p}`); };
  const pendingTotal = pending.reduce((a, o) => a + o.totalPaise, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar icon={ReceiptTextIcon} iconClass={OBJECT_TINT.orders} title="Orders" info="Orders booked by agents during visits. Each one is priced at the gold rate in force when it was booked and never changes afterwards." />
      <ViewBar right={pending.length > 0 ? <span className="hidden text-[13px] text-ink-2 sm:inline"><span className="num font-medium text-ink">{pending.length}</span> awaiting approval · <span className="num font-medium text-gold-ink">{formatINRCompact(pendingTotal)}</span></span> : undefined}>
        <ViewTabs value={view} onChange={setView} items={[
          { value: "all", label: "All", count: orders.data ? count("all") : undefined },
          { value: "pending", label: "Awaiting approval", count: orders.data ? count("pending") : undefined },
          { value: "approved", label: "Approved", count: orders.data ? count("approved") : undefined },
          { value: "rejected", label: "Rejected", count: orders.data ? count("rejected") : undefined },
        ]} />
      </ViewBar>
      <FilterBar right={<SearchInput value={q} onChange={setQ} placeholder="Search order, shop, agent" />}>
        <FilterChip label="Agent" icon={UserIcon} value={agent} onChange={setAgent} options={[{ value: "all", label: "All agents" }, ...uniq("agent")]} />
        <FilterChip label="Shop" icon={StoreIcon} value={shop} onChange={setShop} options={[{ value: "all", label: "All shops" }, ...uniq("shop")]} />
        <FilterChip label="Created" icon={CalendarIcon} value={when} onChange={setWhen} options={[{ value: "all", label: "Any time" }, { value: "today", label: "Today" }, { value: "week", label: "Last 7 days" }]} />
      </FilterBar>
      {orders.error ? <ErrorState error={orders.error} retry={() => orders.refetch()} /> : orders.isLoading ? <RowsSkeleton /> : (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(o) => o.id}
          onOpen={(o) => router.push(`/admin/orders/${o.id}`)}
          countLabel="orders"
          initialSort={[{ id: "created", desc: true }]}
          empty={<Empty icon={ReceiptTextIcon} title={all.length ? "No orders match" : "No orders yet"} hint={all.length ? "Change the view or clear the filters." : "Orders appear here as soon as an agent books one during a visit."} />}
          bulkActions={(sel, clear) => {
            const approvable = sel.filter((o) => o.status === "SUBMITTED");
            return (
              <Btn variant="ghost" size="sm" icon={CheckIcon} disabled={!approvable.length} onClick={() => setConfirm({ rows: approvable, clear })}>
                {approvable.length ? `Approve ${approvable.length}` : "Nothing to approve"}
              </Btn>
            );
          }}
        />
      )}
      <Modal
        open={!!confirm}
        onOpenChange={(o) => { if (!o) { if (results) confirm?.clear(); closeConfirm(); } }}
        title={results ? "Some orders were not approved" : `Approve ${confirm?.rows.length ?? 0} order${confirm?.rows.length === 1 ? "" : "s"}?`}
        description={results ? <>Each order was approved on its own; the ones below that say “Not approved” didn&apos;t change.</> : <>Worth <span className="num font-medium text-gold-ink">{formatINR(confirm?.rows.reduce((a, o) => a + o.totalPaise, 0) ?? 0)}</span> incl. GST, at the rates each order was booked at. Approval is recorded with your name and can&apos;t be undone.</>}
        footer={results
          ? <Btn variant="primary" onClick={() => { confirm?.clear(); closeConfirm(); }}>Done</Btn>
          : <><Btn variant="ghost" onClick={closeConfirm}>Cancel</Btn><Btn variant="primary" disabled={approve.isPending} onClick={() => confirm && approve.mutate(confirm.rows)}>{approve.isPending ? "Approving…" : "Approve"}</Btn></>}
      >
        <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-[10px] border border-line text-[13px]">
          {confirm?.rows.map((o) => {
            const r = results?.get(o.id);
            return (
              <li key={o.id} className="flex min-h-9 flex-wrap items-center gap-x-2 px-3 py-1.5">
                <span className="num font-medium">{o.number}</span><span className="truncate text-ink-2">{o.shop.name}</span>
                <span className="ml-auto">{r ? (r.ok ? <Dot tone="green">Approved</Dot> : <Dot tone="red">Not approved</Dot>) : <span className="num text-gold-ink">{formatINR(o.totalPaise)}</span>}</span>
                {r && !r.ok && <span className="w-full text-[12.5px] text-danger">{r.error?.message ?? "Unknown error"}</span>}
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}

function OrdersInner() {
  const hydrated = useHydrated();
  return hydrated ? <OrdersBody /> : <RowsSkeleton />;
}

export default function OrdersPage() {
  return <React.Suspense fallback={<RowsSkeleton />}><OrdersInner /></React.Suspense>;
}
