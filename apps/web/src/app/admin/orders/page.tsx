"use client";
/** Orders — Attio list page (TitleBar → ViewBar → FilterBar → DataTable), modelled on /admin/visits. */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useUrlPatch, useUrlSort, useUrlState } from "@/lib/url-state";
import { CalendarIcon, CheckIcon, CircleDotIcon, HashIcon, IndianRupeeIcon, ReceiptTextIcon, ShieldAlertIcon, ShieldCheckIcon, ShieldIcon, ShieldXIcon, StoreIcon, UserIcon, WalletIcon } from "lucide-react";
import { addDays, formatINR, formatINRCompact, istDate } from "@jewelroute/shared";
import { api } from "@/lib/api";
import type { Order } from "@/lib/types";
import { Avatar, Btn, Dot, Empty, FilterBar, FilterChip, RowsSkeleton, SearchInput, TitleBar, ViewBar, ViewTabs } from "@/components/app/chrome";
import { DataTable, Muted, NameCell, type Col } from "@/components/app/data-table";
import { OBJECT_TINT } from "@/components/app/shell";
import { useOrders, useWrite } from "@/components/admin-v2/sales/data";
import { ErrorState, fmtDay, fmtDayTime, Modal, useHydrated } from "@/components/admin-v2/sales/ui";
import { isPendingApproval, OrderStatusDot, reasonsText } from "@/components/app/status";
import { RecordPreview, usePreview } from "@/components/app/record-preview";
import { OrderPreview } from "@/components/admin-v2/previews";
import { cn } from "@/lib/utils";

type View = "all" | "pending" | "confirmed" | "approved" | "unsettled" | "rejected" | "cancelled";
const VIEWS: View[] = ["all", "pending", "confirmed", "approved", "unsettled", "rejected", "cancelled"];
const VIEW_LABEL: Record<View, string> = { all: "All orders", pending: "Pending approval", confirmed: "Confirmed", approved: "Approved", unsettled: "Unsettled", rejected: "Rejected", cancelled: "Cancelled" };
/** Which orders a view shows — by the API's status (and settledAt for "Unsettled"). */
const inView = (v: View, o: Order) =>
  v === "all" ? true : v === "pending" ? isPendingApproval(o.status) : v === "unsettled" ? (o.status === "CONFIRMED" || o.status === "APPROVED") && !o.settledAt
  : o.status === ({ confirmed: "CONFIRMED", approved: "APPROVED", rejected: "REJECTED", cancelled: "CANCELLED" } as const)[v];
/** Table-width phrasing of the frozen approval reasons ("Over limit by ₹1.3L", "≥ ₹10L threshold"); the
 *  full sentence (reasonsText) is the cell's tooltip and the record's wording. */
function shortWhy(o: Order) {
  const ap = o.approval; const p = ap?.position;
  return (ap?.reasons ?? []).map((r) => r === "CREDIT_LIMIT"
    ? (p && p.creditLimitPaise > 0 && p.projectedExposurePaise > p.creditLimitPaise ? `Over limit by ${formatINRCompact(p.projectedExposurePaise - p.creditLimitPaise)}` : "Over credit limit")
    : (p?.approvalThresholdPaise != null ? `≥ ${formatINRCompact(p.approvalThresholdPaise)} threshold` : "Above threshold")).join(" · ");
}
type BatchResult = { id: string; ok: boolean; number?: string; status?: string; error?: { code: string; message: string } };
type BatchApprove = { results: BatchResult[]; approved: number; failed: number };

function OrdersBody() {
  const router = useRouter();
  const [viewRaw, setView] = useUrlState("view", "all");
  const view = (VIEWS.includes(viewRaw as View) ? viewRaw : "all") as View;
  const preview = usePreview();
  const [q, setQ] = useUrlState("q");
  const [agent, setAgent] = useUrlState("agent", "all");
  const [shop, setShop] = useUrlState("shop", "all");
  const [when, setWhen] = useUrlState("created", "all");
  const [sorting, setSorting] = useUrlSort([{ id: "created", desc: true }]);
  const [confirm, setConfirm] = React.useState<{ rows: Order[]; clear: () => void } | null>(null);
  const orders = useOrders();
  const patch = useUrlPatch();
  const all = React.useMemo(() => orders.data ?? [], [orders.data]);
  const today = istDate();

  const uniq = <K extends "agent" | "shop">(k: K) => [...new Map(all.map((o) => [o[k].id, o[k].name])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  const count = (v: View) => all.filter((o) => inView(v, o)).length;
  const s = q.trim().toLowerCase();
  const rows = all.filter((o) =>
    inView(view, o) &&
    (agent === "all" || o.agent.id === agent) && (shop === "all" || o.shop.id === shop) &&
    (when === "all" || (when === "today" ? istDate(new Date(o.createdAt)) === today : istDate(new Date(o.createdAt)) >= addDays(today, -6))) &&
    (!s || `${o.number} ${o.shop.name} ${o.shop.area ?? ""} ${o.agent.name}`.toLowerCase().includes(s)),
  );
  const total = rows.reduce((a, o) => a + o.totalPaise, 0);
  const pending = all.filter((o) => isPendingApproval(o.status));

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
      id: "number", header: "Order", accessorFn: (o) => o.number, meta: { icon: HashIcon, width: 184 },
      cell: ({ row: { original: o } }) => <NameCell name={<span className="num">{o.number}</span>} />,
    },
    { id: "shop", header: "Shop", accessorFn: (o) => o.shop.name, meta: { phone: false, icon: StoreIcon, width: 164 }, cell: ({ row: { original: o } }) => <span className="flex min-w-0 items-center gap-2" title={o.shop.area ? `${o.shop.name} · ${o.shop.area}` : o.shop.name}><Avatar name={o.shop.name} square /><span className="truncate">{o.shop.name}</span></span> },
    { id: "agent", header: "Agent", accessorFn: (o) => o.agent.name, meta: { phone: false, icon: UserIcon, width: 132 }, cell: ({ row: { original: o } }) => <span className="flex min-w-0 items-center gap-2"><Avatar name={o.agent.name} /><span className="truncate">{o.agent.name}</span></span> },
    {
      id: "amount", header: "Amount", accessorFn: (o) => o.totalPaise, meta: { icon: IndianRupeeIcon, width: 112, align: "right", footer: rows.length ? <span className="num"><span className="text-ink-3">Sum </span><span className="font-medium text-ink">{formatINRCompact(total)}</span></span> : undefined },
      cell: ({ row: { original: o } }) => <span className={cn("num font-medium", o.status === "REJECTED" || o.status === "CANCELLED" ? "text-ink-3" : "text-ink")}>{formatINR(o.totalPaise)}</span>,
    },
    {
      id: "status", header: "Status", accessorFn: (o) => o.status, meta: { icon: CircleDotIcon, width: 152 },
      // Pending rows act from the row, through the side sheet: approving needs the credit check in view.
      // Status stays visible on every width, so the action does too.
      cell: ({ row: { original: o } }) => isPendingApproval(o.status) ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full bg-warn" aria-hidden /><span className="truncate max-sm:sr-only" title="Pending approval">Pending</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); preview.open(o.id); }}
            className="press h-6 shrink-0 rounded-md sm:ml-auto border border-line-strong bg-white px-2 text-[12px] font-medium text-ink hover:bg-hover">
            Review
          </button>
        </span>
      ) : <OrderStatusDot status={o.status} />,
    },
    {
      id: "approval", header: "Approval", accessorFn: (o) => (o.approval?.required ? o.approval.reasons.join() : ""), meta: { phone: false, icon: ShieldCheckIcon, width: 184 },
      cell: ({ row: { original: o } }) => {
        if (!o.approval) return <Muted />;
        if (!o.approval.required) return <Muted>Not needed</Muted>;
        const why = reasonsText(o.approval.reasons, o.approval.position);
        const pend = isPendingApproval(o.status);
        return (
          <span className="flex min-w-0 items-center gap-1.5" title={why}>
            {pend ? <ShieldAlertIcon className="size-3.5 shrink-0 text-warn" strokeWidth={2} /> : o.status === "APPROVED" ? <ShieldCheckIcon className="size-3.5 shrink-0 text-verified" strokeWidth={2} /> : o.status === "REJECTED" ? <ShieldXIcon className="size-3.5 shrink-0 text-danger" strokeWidth={2} /> : <ShieldIcon className="size-3.5 shrink-0 text-ink-3" strokeWidth={2} />}
            {/* Status says approved/rejected; this cell says why it needed a decision and who made it. */}
            <span className={cn("truncate text-[13px]", pend ? "text-warn" : "text-ink-2")}>{shortWhy(o)}{!pend && o.decidedBy ? ` · ${o.decidedBy.name.split(" ")[0]}` : ""}</span>
          </span>
        );
      },
    },
    { id: "created", header: "Created", accessorFn: (o) => o.createdAt, meta: { phone: false, icon: CalendarIcon, width: 132 }, cell: ({ row: { original: o } }) => <span className="num">{fmtDayTime(o.createdAt)}</span> },
    {
      id: "settled", header: "Payment", accessorFn: (o) => o.settledAt ?? "", meta: { phone: false, icon: WalletIcon, width: 124 },
      cell: ({ row: { original: o } }) => o.settledAt ? <span className="num text-ink-2">Settled {fmtDay(o.settledAt)}</span> : o.status === "CONFIRMED" || o.status === "APPROVED" ? <span className="text-ink">Unpaid</span> : <Muted />,
    },
  ];

  const pendingTotal = pending.reduce((a, o) => a + o.totalPaise, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar icon={ReceiptTextIcon} iconClass={OBJECT_TINT.orders} title="Orders" info="Orders booked by agents during visits, priced at the gold rate in force when booked. Most are confirmed straight away; an order waits for approval only when it takes the retailer over their credit limit or is above the approval threshold (Settings)." />
      <ViewBar right={pending.length > 0 ? <span className="hidden text-[13px] text-ink-2 sm:inline"><span className="num font-medium text-ink">{pending.length}</span> pending approval · <span className="num font-medium text-ink">{formatINRCompact(pendingTotal)}</span></span> : undefined}>
        <ViewTabs value={view} onChange={setView} items={[
          { value: "all", label: "All", count: orders.data ? count("all") : undefined },
          { value: "pending", label: "Pending approval", count: orders.data ? count("pending") : undefined },
          { value: "confirmed", label: "Confirmed", count: orders.data ? count("confirmed") : undefined },
          { value: "approved", label: "Approved", count: orders.data ? count("approved") : undefined },
          { value: "unsettled", label: "Unsettled", count: orders.data ? count("unsettled") : undefined },
          { value: "rejected", label: "Rejected", count: orders.data ? count("rejected") : undefined },
          { value: "cancelled", label: "Cancelled", count: orders.data ? count("cancelled") : undefined },
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
          onPreview={(o) => preview.open(o.id)}
          activeId={preview.id}
          onOrderChange={preview.setOrder}
          fit
          countLabel="orders"
          sorting={sorting}
          onSortingChange={setSorting}
          empty={<Empty icon={ReceiptTextIcon} title={all.length ? "No orders match" : "No orders yet"} hint={all.length ? "Change the view or clear the filters." : "Orders appear here as soon as an agent books one during a visit."} action={all.length ? <Btn onClick={() => patch({ q: null, agent: null, shop: null, created: null, view: null })}>Clear filters</Btn> : undefined} />}
          bulkActions={(sel, clear) => {
            const approvable = sel.filter((o) => isPendingApproval(o.status));
            return (
              <Btn variant="ghost" size="sm" icon={CheckIcon} disabled={!approvable.length} onClick={() => setConfirm({ rows: approvable, clear })}>
                {approvable.length ? `Approve ${approvable.length}` : "Nothing to approve"}
              </Btn>
            );
          }}
        />
      )}
      <RecordPreview state={preview} viewLabel={VIEW_LABEL[view]} href={preview.id ? `/admin/orders/${preview.id}` : undefined}>
        {preview.id && <OrderPreview id={preview.id} />}
      </RecordPreview>
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
