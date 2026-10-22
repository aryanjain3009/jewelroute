"use client";
/** Shop record — a real CRM record for a retailer (Attio company record): who covers it, what it owes
 *  and how much credit is left (API CreditPosition), which physical samples sit there, and every event
 *  at the counter from the one activity feed. Tabs: Overview · Visits · Orders · Memos · Activity. */
import { useDocTitle } from "@/lib/title";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ActivityIcon, CalendarClockIcon, ClockIcon, CompassIcon, CreditCardIcon, GaugeIcon, GemIcon, LayoutGridIcon, MapPinIcon, MapPinnedIcon, NavigationIcon,
  PencilIcon, PhoneIcon, ReceiptTextIcon, ScrollTextIcon, UserIcon, UserRoundIcon, WalletIcon,
} from "lucide-react";
import { formatINR, formatINRCompact, istDate, PURITY_LABEL } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
import type { CreditPosition, PieceRow } from "@/lib/types";
import { Avatar, Btn, Empty } from "@/components/app/chrome";
import { Highlight, Highlights, ListCard, ListRow, MainSection, Property, PropertySection, RecordHeader, RecordLayout, RecordTabs, useTab } from "@/components/app/record";
import { ActivityFeed } from "@/components/app/activity-feed";
import { ExposureBar } from "@/components/app/credit";
import { isPendingApproval, ORDER_STATUS, SIMULATED_LOCATION } from "@/components/app/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAgentOptions, useShopRecord, type ShopRec, type VRow } from "./data";
import { AssignVisitDialog, ShopSheet, useSetShopAgent } from "./dialogs";
import { MemoRow, OrderRow } from "./visit-record";
import { MiniTable, MTd } from "@/components/admin-v2/sales/ui";
import {
  LinkBtn, PIECE_STATUS, PROOF, QueryError, RecordSkeleton, SHOP_STATUS, StatusChip, StatusDot, VISIT_STATUS, fmtCoord, fmtDist,
  istDay, istTime, mediaUrl, relDay, wallTime,
} from "./ui";

export function ShopRecord({ id }: { id: string }) {
  const q = useShopRecord(id);
  useDocTitle(q.data?.shop.name);
  const tab = useTab("overview");
  const router = useRouter();
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  if (q.isLoading) return <RecordSkeleton />;
  if (q.error || !q.data) return <QueryError error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const s = d.shop;
  const setTab = (t: string) => router.replace(`/admin/shops/${id}?tab=${t}`, { scroll: false });
  // Open orders = waiting for a decision, or confirmed/approved and not yet settled (the API's settledAt).
  const openOrders = d.orders.filter((o) => isPendingApproval(o.status) || ((o.status === "CONFIRMED" || o.status === "APPROVED") && !o.settledAt));
  // Outstanding (API) = opening balance + unsettled CONFIRMED/APPROVED orders; a pending order is not owed
  // yet. The sub-line counts exactly the orders that are summed, and names pending ones separately.
  const unsettled = d.orders.filter((o) => (o.status === "CONFIRMED" || o.status === "APPROVED") && !o.settledAt);
  const pendingCount = d.orders.filter((o) => isPendingApproval(o.status)).length; // listed under Open orders, not owed yet
  const c = s.credit;

  return (
    <RecordLayout
      back={{ href: "/admin/shops", label: "Shops" }}
      crumb={s.name}
      panel={<Panel d={d} onAssign={() => setAssignOpen(true)} onEdit={() => setEditOpen(true)} />}
    >
      <RecordTabs tabs={[
        { value: "overview", label: "Overview", icon: LayoutGridIcon },
        { value: "visits", label: "Visits", icon: MapPinnedIcon, count: d.visits.length },
        { value: "orders", label: "Orders", icon: ReceiptTextIcon, count: d.orders.length },
        { value: "memos", label: "Memos", icon: ScrollTextIcon, count: d.memos.length },
        { value: "activity", label: "Activity", icon: ActivityIcon },
      ]} />

      {tab === "overview" && (
        <div className="pb-10">
          <MainSection title="Credit position" action={c?.overLimit ? <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-danger"><span className="size-1.5 rounded-full bg-danger" />Over credit limit</span> : undefined}>
            <CreditBlock c={c} limitPaise={s.creditLimitPaise} unsettled={unsettled.length} pending={pendingCount} memoCount={s.activeMemoCount} />
          </MainSection>

          {/* Highlights hold only what Credit position and the sections below don't: memo value is the
              "On memo" cell, samples-here value heads its own list. Today that leaves the last order. */}
          {s.lastOrder && (
          <MainSection title="Highlights">
            <Highlights>
              {s.lastOrder && (
                <Highlight label="Last order" icon={ReceiptTextIcon} sub={<span className="inline-flex items-center gap-1.5"><span className="num">{s.lastOrder.number}</span><span className="text-ink-3">·</span>{ORDER_STATUS[s.lastOrder.status]?.[1] ?? s.lastOrder.status}</span>}>
                  <Link href={`/admin/orders/${s.lastOrder.id}`} className="num decoration-ink-3 decoration-dotted underline-offset-4 hover:underline">{formatINRCompact(s.lastOrder.totalPaise)}<span className="font-normal text-ink-3"> · {istDay(s.lastOrder.createdAt)}</span></Link>
                </Highlight>
              )}
            </Highlights>
          </MainSection>
          )}

          <MainSection title="Recent activity" action={<button type="button" onClick={() => setTab("activity")} className="rounded-md px-1.5 py-0.5 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink">View all</button>}>
            <ActivityFeed framed filter={{ shopId: s.id }} selfId={s.id} compact max={5} empty={<p className="text-[13px] text-ink-3">Nothing has happened at this shop yet.</p>} />
          </MainSection>

          <MainSection title="Samples here" count={d.pieces.length} action={d.pieces.length ? <span className="flex items-center gap-2">{s.samplesHereCount > 0 && <span className="num text-[13px] text-ink-3"><span className="font-medium text-gold-ink">{formatINRCompact(s.samplesHereValuePaise)}</span> at today&apos;s rate</span>}<Link href={`/admin/samples?shop=${s.id}`} className="rounded-md px-1.5 py-0.5 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink">Open in Samples</Link></span> : undefined}>
            {d.pieces.length ? <ListCard>{d.pieces.map((p) => <PieceLine key={p.id} p={p} />)}</ListCard> : <p className="text-[13px] text-ink-3">No pieces are at this shop. Pieces left on memo appear here until they come back or are sold.</p>}
          </MainSection>

          <MainSection title="Open orders" count={openOrders.length} action={d.orders.length > openOrders.length ? <button type="button" onClick={() => setTab("orders")} className="rounded-md px-1.5 py-0.5 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink">All {d.orders.length}</button> : undefined}>
            {openOrders.length ? <ListCard>{openOrders.map((o) => <OrderRow key={o.id} o={o} />)}</ListCard> : <p className="text-[13px] text-ink-3">No open orders — everything booked here is settled or decided.</p>}
          </MainSection>
        </div>
      )}

      {tab === "visits" && (
        <MainSection title="Visits" count={d.visits.length} action={<Btn size="sm" icon={MapPinnedIcon} onClick={() => setAssignOpen(true)}>Assign visit</Btn>}>
          {d.visits.length ? <VisitList visits={d.visits} /> : <p className="text-[13px] text-ink-3">No visits in the last 30 days. Assign one so an agent drops by.</p>}
        </MainSection>
      )}
      {tab === "orders" && (
        <MainSection title="Orders" count={d.orders.length}>
          {d.orders.length ? <ListCard>{d.orders.map((o) => <OrderRow key={o.id} o={o} />)}</ListCard> : <p className="text-[13px] text-ink-3">No orders yet. Orders booked during visits to this shop appear here.</p>}
        </MainSection>
      )}
      {tab === "memos" && (
        <MainSection title="Memos" count={d.memos.length}>
          {d.memos.length ? <ListCard>{d.memos.map((m) => <MemoRow key={m.id} m={m} />)}</ListCard> : <p className="text-[13px] text-ink-3">No memos yet. When an agent leaves samples here on memo, it shows up with its due date.</p>}
        </MainSection>
      )}
      {tab === "activity" && (
        <div className="px-6 py-5">
          <h2 className="mb-4 text-[15px] font-medium text-ink">Activity</h2>
          <ActivityFeed filter={{ shopId: s.id }} selfId={s.id} empty={<Empty icon={ActivityIcon} title="No activity yet" hint="Check-ins, proofs, orders, memos and custody moves at this shop appear here." />} />
        </div>
      )}

      <AssignVisitDialog open={assignOpen} onOpenChange={setAssignOpen} shopId={s.id} agentId={s.assignedAgent?.id} />
      <ShopSheet open={editOpen} onOpenChange={setEditOpen} shop={s} openingOutstandingPaise={c?.openingOutstandingPaise ?? (c ? 0 : undefined)} />
    </RecordLayout>
  );
}

/* ---------------- credit position (API CreditPosition only; compact figures, exact ones live in the panel) ---------------- */
export function CreditBlock({ c, limitPaise, unsettled, pending, memoCount, compact }: { c?: CreditPosition; limitPaise: number; unsettled: number; pending: number; memoCount: number; compact?: boolean }) {
  if (!c) return <div className="rounded-[10px] border border-line px-4 py-3.5 text-[13px] text-ink-3">No credit position for this shop.</div>;
  const limited = c.availableCreditPaise != null && c.creditLimitPaise > 0;
  const outSub = !unsettled && c.openingOutstandingPaise && c.openingOutstandingPaise === c.outstandingPaise ? "All opening balance" : [unsettled ? `${unsettled} unsettled order${unsettled === 1 ? "" : "s"}` : "", c.openingOutstandingPaise ? `${formatINRCompact(c.openingOutstandingPaise)} opening` : ""].filter(Boolean).join(" + ") || (pending ? "Pending orders aren't owed yet" : "Nothing unsettled");
  const cells: { label: string; value: React.ReactNode; sub: React.ReactNode; dot?: string }[] = [
    { label: "Outstanding", dot: "bg-[#55565a]", value: c.outstandingPaise ? formatINR(c.outstandingPaise) : <span className="text-ink-3">Nothing owed</span>, sub: outSub },
    { label: "On memo", dot: "bg-gold", value: c.memoExposurePaise ? <span className="text-gold-ink">{formatINR(c.memoExposurePaise)}</span> : <span className="text-ink-3">None</span>, sub: memoCount ? `${memoCount} active memo${memoCount === 1 ? "" : "s"}` : "No samples on memo" },
    { label: "Available credit", value: limited ? <span className={cn(c.overLimit && "text-danger")}>{formatINR(c.availableCreditPaise!)}</span> : <span className="text-ink-3">No limit</span>, sub: limited ? (c.overLimit ? `Over by ${formatINRCompact(c.exposurePaise - c.creditLimitPaise)}` : "Left to book") : "Orders never trip the credit rule" },
    { label: "Credit limit", value: limitPaise > 0 ? formatINR(limitPaise) : <span className="text-ink-3">No limit</span>, sub: c.approvalThresholdPaise != null ? `Approval from ${formatINRCompact(c.approvalThresholdPaise)}` : "Set on the shop" },
  ];
  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <div className={cn("grid grid-cols-2 gap-px bg-line", !compact && "md:grid-cols-4")}>
        {cells.map((x) => (
          <div key={x.label} className="min-w-0 bg-white px-4 py-3">
            <div className="flex items-center gap-1.5 text-[13px] text-ink-2">{x.dot && <span className={cn("size-1.5 shrink-0 rounded-full", x.dot)} />}{x.label}</div>
            <div className="num mt-1 truncate text-[18px] font-medium leading-7 tracking-[-0.01em] text-ink">{x.value}</div>
            <div className="truncate text-[12.5px] text-ink-3" title={typeof x.sub === "string" ? x.sub : undefined}>{x.sub}</div>
          </div>
        ))}
      </div>
      {limited && (
        <div className="border-t border-line px-4 py-3">
          <ExposureBar p={c} showOrder={false} className="h-2" />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#55565a]" />Outstanding</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-gold" />On memo</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#efefef] ring-1 ring-line-strong" />Available</span>
            <span className="num ml-auto text-ink-2"><span className={cn("font-medium", c.overLimit ? "text-danger" : "text-ink")}>{formatINRCompact(c.exposurePaise)}</span> of {formatINRCompact(c.creditLimitPaise)} used</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- left panel ---------------- */
function Panel({ d, onAssign, onEdit }: { d: ShopRec; onAssign: () => void; onEdit: () => void }) {
  const s = d.shop;
  const c = s.credit;
  const upcoming = s.upcomingVisit ?? s.nextVisit;
  const open = d.visits.find((v) => v.status === "CHECKED_IN" || v.status === "ACTIVE");
  return (
    <>
      <RecordHeader
        lead={<Avatar name={s.name} size={40} square className="rounded-[10px] text-[15px]" />}
        title={s.name}
        subtitle={<span className="inline-flex items-center gap-2">{s.area}, {s.city}<StatusChip map={SHOP_STATUS} value={s.status} /></span>}
        primary={<Btn icon={MapPinnedIcon} onClick={onAssign}>Assign visit</Btn>}
        actions={<>
          {s.phone && <Tip label={`Call ${s.phone}`}><LinkBtn href={`tel:${s.phone.replace(/\s/g, "")}`} external icon={PhoneIcon} label="Call shop" /></Tip>}
          <Tip label="Navigate"><LinkBtn href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`} external icon={NavigationIcon} label="Navigate to shop" /></Tip>
          <Tip label="Edit shop"><Btn icon={PencilIcon} aria-label="Edit shop" onClick={onEdit} /></Tip>
        </>}
      />
      <PropertySection title="Relationship">
        <Property icon={UserIcon} label="Assigned agent"><AgentSelect shopId={s.id} value={s.assignedAgent} /></Property>
        {/* An agent checked in right now is the freshest visit there is — say so instead of an empty "last visit". */}
        {open ? (
          <Property icon={ClockIcon} label="Visit">
            <span className="flex flex-col">
              <Link href={`/admin/visits/${open.id}`} className="inline-flex items-center gap-1.5 decoration-ink-3 decoration-dotted underline-offset-4 hover:underline"><span className="size-1.5 rounded-full bg-blue" aria-hidden />In visit now</Link>
              <span className="text-[13px] text-ink-3">{open.agent.name}{open.checkInAt ? ` · since ${istTime(open.checkInAt)}` : ""}</span>
            </span>
          </Property>
        ) : (
          <Property icon={ClockIcon} label="Last visit">{s.lastVisitAt ? <span className="flex flex-col"><span>{relDay(s.lastVisitAt)}</span>{s.lastVisitAgent && <span className="text-[13px] text-ink-3">{s.lastVisitAgent.name}</span>}</span> : <span className="text-ink-3">None yet</span>}</Property>
        )}
        <Property icon={CalendarClockIcon} label="Upcoming visit">{upcoming ? <span className="flex flex-col"><Link href={`/admin/visits/${upcoming.id}`} className="decoration-ink-3 decoration-dotted underline-offset-4 hover:underline">{upcoming.date === istDate() ? "Today" : istDay(upcoming.date)}{upcoming.plannedTime ? `, ${wallTime(upcoming.plannedTime)}` : ""}</Link><span className="text-[13px] text-ink-3">{upcoming.agent.name}</span></span> : <span className="text-ink-3">Not planned</span>}</Property>
        <Property icon={ReceiptTextIcon} label="Previous orders">{d.orders.length > 0 && <span className="num">{d.orders.length}{d.orders.length >= 50 ? "+" : ""}{s.lastOrder ? <span className="text-ink-3"> · last {istDay(s.lastOrder.createdAt)}</span> : d.orders[0] ? <span className="text-ink-3"> · last {istDay(d.orders[0].createdAt)}</span> : null}</span>}{d.orders.length === 0 && <span className="text-ink-3">None yet</span>}</Property>
      </PropertySection>
      <PropertySection title="Credit" defaultOpen={false}>
        <Property icon={WalletIcon} label="Outstanding">{c && <span className="flex flex-col"><span className="num">{formatINR(c.outstandingPaise)}</span>{!!c.openingOutstandingPaise && <span className="num text-[13px] text-ink-3">incl. {formatINRCompact(c.openingOutstandingPaise)} opening balance</span>}</span>}</Property>
        <Property icon={CreditCardIcon} label="Credit limit">{s.creditLimitPaise > 0 ? <span className="num">{formatINR(s.creditLimitPaise)}</span> : <span className="text-ink-3">No limit</span>}</Property>
        <Property icon={GaugeIcon} label="Available credit">
          {c && (c.availableCreditPaise == null ? <span className="text-ink-3">No limit</span> : (
            <span className={cn("num", c.overLimit && "text-danger")}>{formatINR(c.availableCreditPaise)}{c.overLimit && <span className="text-[13px]"> · over by {formatINRCompact(c.exposurePaise - c.creditLimitPaise)}</span>}</span>
          ))}
        </Property>
        <Property icon={ScrollTextIcon} label="Active memo value">{s.activeMemoCount > 0 && <span className={cn("num", s.status === "MEMO_OVERDUE" ? "text-danger" : "text-gold-ink")}>{formatINR(s.activeMemoValuePaise)}<span className="text-ink-3"> · {s.activeMemoCount} memo{s.activeMemoCount > 1 ? "s" : ""}</span></span>}</Property>
        <Property icon={GemIcon} label="Current samples">{s.samplesHereCount > 0 && <span className="num text-gold-ink">{s.samplesHereCount} piece{s.samplesHereCount > 1 ? "s" : ""} · {formatINR(s.samplesHereValuePaise)}</span>}</Property>
      </PropertySection>
      <PropertySection title="Shop details" collapseBelowLg>
        <Property icon={UserRoundIcon} label="Owner">{s.ownerName}</Property>
        <Property icon={PhoneIcon} label="Phone">{s.phone && <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="num hover:underline">{s.phone}</a>}</Property>
        <Property icon={MapPinIcon} label="Address"><span className="line-clamp-2">{s.address}</span></Property>
        <Property icon={CompassIcon} label="Geofence"><span className="num">{s.geofenceRadiusM} m</span><span className="num block text-[13px] text-ink-3">{fmtCoord(s.lat, s.lng)}</span></Property>
      </PropertySection>
    </>
  );
}

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

/** Attio inline-editable select: looks like the value, edits in place, PATCHes the shop. */
function AgentSelect({ shopId, value }: { shopId: string; value?: { id: string; name: string } }) {
  const agents = useAgentOptions();
  const m = useSetShopAgent(shopId);
  return (
    <label className={cn("relative -mx-1.5 inline-flex h-7 max-w-full cursor-pointer items-center gap-2 rounded-md px-1.5 hover:bg-hover", m.isPending && "opacity-60")}>
      {value ? <><Avatar name={value.name} size={20} /><span className="truncate">{value.name}</span></> : <span className="text-ink-3">Unassigned</span>}
      <PencilIcon className="size-3 shrink-0 text-ink-3" />
      <select
        aria-label="Assigned agent"
        value={value?.id ?? ""}
        disabled={m.isPending}
        onChange={(e) => m.mutate(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">Unassigned</option>
        {(agents.data ?? []).filter((a) => a.active || a.id === value?.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}

export function PieceLine({ p, compact }: { p: PieceRow; compact?: boolean }) {
  return (
    <ListRow href={`/admin/samples/${p.id}`} className={cn("group py-1.5", compact && "gap-2.5 px-2.5")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.imageUrl ? <img src={mediaUrl(p.imageUrl)} alt="" className={cn("shrink-0 rounded-md border border-line object-cover", compact ? "size-7" : "size-8")} /> : <span className="size-8 shrink-0 rounded-md bg-hover" />}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5"><span className="num text-[13px] font-medium text-ink">{p.tagCode}</span><span className="text-[12px] font-semibold text-gold-ink">{PURITY_LABEL[p.purity]}</span></span>
        <span className="block truncate text-[12.5px] text-ink-3">{p.name}{!compact && p.memo && ` · ${p.memo.number} · due ${istDay(p.memo.dueDate)}`}</span>
      </span>
      {!compact && <span className="hidden w-[110px] shrink-0 sm:block"><StatusDot map={PIECE_STATUS} value={p.status} className="text-[13px]" /></span>}
      {compact && p.status === "OVERDUE" && <span className="size-1.5 shrink-0 rounded-full bg-danger" title="Memo overdue" />}
      <span className="num shrink-0 text-right text-[13px] font-medium text-gold-ink">{formatINRCompact(p.valuePaise)}</span>
    </ListRow>
  );
}

export function VisitList({ visits, showShop, showAgent = true }: { visits: VRow[]; showShop?: boolean; showAgent?: boolean }) {
  const today = istDate();
  const router = useRouter();
  const head = [
    { label: "Planned", width: 132 },
    ...(showShop ? [{ label: "Shop" }] : []),
    ...(showAgent ? [{ label: "Agent", ...(showShop ? { width: 140 } : {}) }] : []),
    { label: "Status", width: 112 },
    { label: "Proof", width: 108 },
    { label: "Distance", align: "right" as const, width: 84 },
    { label: "Check-in", align: "right" as const, width: 88 },
    { label: "Order", align: "right" as const, width: 84 },
  ];
  return (
    <MiniTable head={head} minWidth={720}>
      {visits.map((v) => (
        <tr key={v.id} onClick={() => router.push(`/admin/visits/${v.id}`)} className="group cursor-pointer transition-colors hover:bg-hover">
          <MTd className="num"><Link href={`/admin/visits/${v.id}`} onClick={(e) => e.stopPropagation()} className="text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline">{v.plannedDate === today ? "Today" : istDay(v.plannedDate)}{v.plannedTime ? `, ${wallTime(v.plannedTime)}` : ""}</Link></MTd>
          {showShop && <MTd className="max-w-0 truncate font-medium">{v.shop.name}</MTd>}
          {showAgent && <MTd className="max-w-0"><span className="flex min-w-0 items-center gap-2"><Avatar name={v.agent.name} size={18} /><span className="truncate">{v.agent.name}</span></span></MTd>}
          <MTd><StatusDot map={VISIT_STATUS} value={v.status} className="text-[13px]" /></MTd>
          <MTd>{v.proofState !== "NOT_STARTED" ? <StatusDot map={PROOF} value={v.proofState} className="text-[13px]" /> : <span className="text-ink-3">—</span>}</MTd>
          <MTd align="right" className="num text-ink-2">{v.verification === "SIMULATED" ? <span className="text-ink-3" title={SIMULATED_LOCATION}>Simulated</span> : fmtDist(v.checkInDistanceM) ?? <span className="text-ink-3">—</span>}</MTd>
          <MTd align="right" className="num text-ink-2">{v.checkInAt ? istTime(v.checkInAt) : <span className="text-ink-3">—</span>}</MTd>
          <MTd align="right" className="num">{v.outcome?.orderValuePaise ? formatINRCompact(v.outcome.orderValuePaise) : <span className="text-ink-3">—</span>}</MTd>
        </tr>
      ))}
    </MiniTable>
  );
}
