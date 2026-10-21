"use client";
/** Shop record — the living business record of a retailer: who covers it, what is outstanding,
 *  which physical samples sit there, and everything that happened at the counter. */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ActivityIcon, CalendarClockIcon, ClockIcon, CompassIcon, CreditCardIcon, GemIcon, LayoutGridIcon, MapPinIcon, MapPinnedIcon, NavigationIcon,
  PencilIcon, PhoneIcon, ReceiptTextIcon, ScrollTextIcon, UserIcon, UserRoundIcon,
} from "lucide-react";
import { formatINRCompact, istDate, PURITY_LABEL } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
import type { PieceRow } from "@/lib/types";
import { Avatar, Btn, Empty } from "@/components/app/chrome";
import { Highlight, Highlights, ListCard, ListRow, MainSection, Property, PropertySection, RecordHeader, RecordLayout, RecordTabs, useTab } from "@/components/app/record";
import { Timeline } from "@/components/app/timeline";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAgentOptions, useShopRecord, type ShopRec, type VRow } from "./data";
import { AssignVisitDialog, ShopSheet, useSetShopAgent } from "./dialogs";
import { MemoRow, OrderRow } from "./visit-record";
import {
  LinkBtn, PIECE_STATUS, PROOF, QueryError, RecordSkeleton, SHOP_STATUS, StatusChip, StatusDot, VISIT_STATUS, daysAgo, fmtCoord, fmtDist,
  istDay, istTime, mediaUrl, relDay, toTimeline, wallTime,
} from "./ui";

export function ShopRecord({ id }: { id: string }) {
  const q = useShopRecord(id);
  const tab = useTab("overview");
  const router = useRouter();
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  if (q.isLoading) return <RecordSkeleton />;
  if (q.error || !q.data) return <QueryError error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const s = d.shop;
  const go = (h: string) => router.push(h);
  const openMemos = d.memos.filter((m) => m.status === "ACTIVE" || m.status === "PARTIALLY_RETURNED");
  const setTab = (t: string) => router.replace(`/admin/shops/${id}?tab=${t}`, { scroll: false });

  return (
    <RecordLayout
      back={{ href: "/admin/shops", label: "Shops" }}
      panel={<Panel d={d} onAssign={() => setAssignOpen(true)} onEdit={() => setEditOpen(true)} />}
    >
      <RecordTabs tabs={[
        { value: "overview", label: "Overview", icon: LayoutGridIcon },
        { value: "visits", label: "Visits", icon: MapPinnedIcon, count: d.visits.length },
        { value: "orders", label: "Orders", icon: ReceiptTextIcon, count: d.orders.length },
        { value: "memos", label: "Memos", icon: ScrollTextIcon, count: d.memos.length },
        { value: "samples", label: "Samples", icon: GemIcon, count: d.pieces.length },
        { value: "activity", label: "Activity", icon: ActivityIcon, count: d.activity.length },
      ]} />

      {tab === "overview" && (
        <div className="pb-10">
          <MainSection title="Highlights">
            <Highlights>
              <Highlight label="Outstanding orders" icon={ReceiptTextIcon} sub={s.openOrdersPaise && s.creditLimitPaise ? `${Math.round((s.openOrdersPaise / s.creditLimitPaise) * 100)}% of ${formatINRCompact(s.creditLimitPaise)} credit limit` : `Credit limit ${formatINRCompact(s.creditLimitPaise)}`}
                tone={s.creditLimitPaise && s.openOrdersPaise > s.creditLimitPaise ? "danger" : undefined}>
                {s.openOrdersPaise ? formatINRCompact(s.openOrdersPaise) : <span className="text-ink-3">None</span>}
              </Highlight>
              <Highlight label="Active memos" icon={ScrollTextIcon} tone={s.status === "MEMO_OVERDUE" ? "danger" : s.activeMemoCount ? "gold" : undefined}
                sub={s.activeMemoCount ? `${s.activeMemoCount} memo${s.activeMemoCount > 1 ? "s" : ""}${s.status === "MEMO_OVERDUE" ? " · overdue" : ""} · value at handover` : "Nothing on memo"}>
                {s.activeMemoCount ? formatINRCompact(s.activeMemoValuePaise) : <span className="text-ink-3">None</span>}
              </Highlight>
              <Highlight label="Samples here" icon={GemIcon} tone={s.samplesHereCount ? "gold" : undefined} sub={s.samplesHereCount ? `${s.samplesHereCount} piece${s.samplesHereCount > 1 ? "s" : ""} · at today's rate` : "No pieces at this shop"}>
                {s.samplesHereCount ? formatINRCompact(s.samplesHereValuePaise) : <span className="text-ink-3">None</span>}
              </Highlight>
              <Highlight label="Last visit" icon={ClockIcon} sub={s.lastVisitAgent?.name} tone={(daysAgo(s.lastVisitAt) ?? 0) > 30 ? "warn" : undefined}>
                {relDay(s.lastVisitAt) ?? <span className="text-ink-3">Never visited</span>}
              </Highlight>
              <Highlight label="Next visit" icon={CalendarClockIcon} sub={s.nextVisit?.agent.name}>
                {s.nextVisit ? <>{s.nextVisit.date === istDate() ? "Today" : istDay(s.nextVisit.date)}{s.nextVisit.plannedTime && `, ${wallTime(s.nextVisit.plannedTime)}`}</> : <span className="text-ink-3">Not planned</span>}
              </Highlight>
              <Highlight label="Assigned agent" icon={UserIcon} sub={s.assignedAgent ? "Covers this shop" : "Pick one in the details panel"}>
                {s.assignedAgent ? <Link href={`/admin/agents/${s.assignedAgent.id}`} className="inline-flex items-center gap-2 hover:underline"><Avatar name={s.assignedAgent.name} size={20} />{s.assignedAgent.name}</Link> : <span className="text-ink-3">Unassigned</span>}
              </Highlight>
            </Highlights>
          </MainSection>

          <MainSection title="Activity" action={<button type="button" onClick={() => setTab("activity")} className="text-[13px] text-ink-2 hover:text-ink">View all</button>}>
            {d.activity.length ? (
              <ListCard className="px-3.5 py-3">
                <Timeline grouped={false} items={toTimeline(d.activity.slice(0, 4), go)} />
              </ListCard>
            ) : <p className="text-[13px] text-ink-3">Nothing has happened at this shop yet.</p>}
          </MainSection>

          <MainSection title="Memos" count={openMemos.length} action={d.memos.length > openMemos.length ? <button type="button" onClick={() => setTab("memos")} className="text-[13px] text-ink-2 hover:text-ink">All {d.memos.length}</button> : undefined}>
            {openMemos.length ? <ListCard>{openMemos.map((m) => <MemoRow key={m.id} m={m} />)}</ListCard> : <p className="text-[13px] text-ink-3">No open memos. Samples left with this shop appear here.</p>}
          </MainSection>

          <MainSection title="Orders" count={d.orders.length} action={d.orders.length > 5 ? <button type="button" onClick={() => setTab("orders")} className="text-[13px] text-ink-2 hover:text-ink">View all</button> : undefined}>
            {d.orders.length ? <ListCard>{d.orders.slice(0, 5).map((o) => <OrderRow key={o.id} o={o} />)}</ListCard> : <p className="text-[13px] text-ink-3">No orders from this shop yet.</p>}
          </MainSection>
        </div>
      )}

      {tab === "visits" && (
        <MainSection title="Visits" count={d.visits.length} action={<Btn size="sm" icon={MapPinnedIcon} onClick={() => setAssignOpen(true)}>Assign visit</Btn>}>
          {d.visits.length ? <VisitList visits={d.visits} /> : <ListCard><Empty icon={MapPinnedIcon} title="No visits in the last 30 days" hint="Plan one so an agent drops by." action={<Btn icon={MapPinnedIcon} onClick={() => setAssignOpen(true)}>Assign visit</Btn>} /></ListCard>}
        </MainSection>
      )}
      {tab === "orders" && (
        <MainSection title="Orders" count={d.orders.length}>
          {d.orders.length ? <ListCard>{d.orders.map((o) => <OrderRow key={o.id} o={o} />)}</ListCard> : <ListCard><Empty icon={ReceiptTextIcon} title="No orders yet" hint="Orders booked during visits to this shop appear here." /></ListCard>}
        </MainSection>
      )}
      {tab === "memos" && (
        <MainSection title="Memos" count={d.memos.length}>
          {d.memos.length ? <ListCard>{d.memos.map((m) => <MemoRow key={m.id} m={m} />)}</ListCard> : <ListCard><Empty icon={ScrollTextIcon} title="No memos yet" hint="When an agent leaves samples here on memo, it shows up with its due date." /></ListCard>}
        </MainSection>
      )}
      {tab === "samples" && (
        <MainSection title="Samples here" count={d.pieces.length}>
          {d.pieces.length ? <ListCard>{d.pieces.map((p) => <PieceLine key={p.id} p={p} />)}</ListCard> : <ListCard><Empty icon={GemIcon} title="No samples at this shop" hint="Pieces left on memo are tracked here until they come back or are sold." /></ListCard>}
        </MainSection>
      )}
      {tab === "activity" && (
        <div className="px-6 py-5">
          <h2 className="mb-4 text-[15px] font-medium text-ink">Activity</h2>
          <Timeline items={toTimeline(d.activity, go, { proofs: true })} empty={<Empty icon={ActivityIcon} title="No activity yet" hint="Check-ins, proofs, orders and memos at this shop appear here." />} />
        </div>
      )}

      <AssignVisitDialog open={assignOpen} onOpenChange={setAssignOpen} shopId={s.id} agentId={s.assignedAgent?.id} />
      <ShopSheet open={editOpen} onOpenChange={setEditOpen} shop={s} />
    </RecordLayout>
  );
}

/* ---------------- left panel ---------------- */
function Panel({ d, onAssign, onEdit }: { d: ShopRec; onAssign: () => void; onEdit: () => void }) {
  const s = d.shop;
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
      <PropertySection title="Shop details">
        <Property icon={UserRoundIcon} label="Owner">{s.ownerName}</Property>
        <Property icon={PhoneIcon} label="Phone">{s.phone && <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="num hover:underline">{s.phone}</a>}</Property>
        <Property icon={UserIcon} label="Assigned agent"><AgentSelect shopId={s.id} value={s.assignedAgent} /></Property>
        <Property icon={CompassIcon} label="Geofence"><span className="num">{s.geofenceRadiusM} m</span><span className="num block text-[13px] text-ink-3">{fmtCoord(s.lat, s.lng)}</span></Property>
        <Property icon={MapPinIcon} label="Address"><span className="line-clamp-2">{s.address}</span></Property>
        <Property icon={ClockIcon} label="Last visit">{s.lastVisitAt && <span>{relDay(s.lastVisitAt)}{s.lastVisitAgent && <span className="text-ink-3"> · {s.lastVisitAgent.name.split(" ")[0]}</span>}</span>}</Property>
        <Property icon={CreditCardIcon} label="Credit / open">
          <span className="num">{formatINRCompact(s.creditLimitPaise)}<span className="text-ink-3"> limit · </span>{s.openOrdersPaise ? formatINRCompact(s.openOrdersPaise) : "₹0"}<span className="text-ink-3"> open</span></span>
        </Property>
        <Property icon={ScrollTextIcon} label="Active memo value">{s.activeMemoCount > 0 && <span className={cn("num", s.status === "MEMO_OVERDUE" ? "text-danger" : "text-gold-ink")}>{formatINRCompact(s.activeMemoValuePaise)}<span className="text-ink-3"> · {s.activeMemoCount} memo{s.activeMemoCount > 1 ? "s" : ""}</span></span>}</Property>
        <Property icon={GemIcon} label="Samples here">{s.samplesHereCount > 0 && <span className="num text-gold-ink">{s.samplesHereCount} · {formatINRCompact(s.samplesHereValuePaise)}</span>}</Property>
      </PropertySection>
      <div className="px-5 py-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[14px] font-medium text-ink">Samples here</h3>
          <span className="num text-[13px] text-ink-3">{d.pieces.length}</span>
        </div>
        {d.pieces.length ? (
          <ListCard>{d.pieces.slice(0, 6).map((p) => <PieceLine key={p.id} p={p} compact />)}</ListCard>
        ) : <p className="text-[13px] text-ink-3">No pieces are at this shop right now.</p>}
      </div>
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
  return (
    <ListCard>
      {visits.map((v) => (
        <ListRow key={v.id} href={`/admin/visits/${v.id}`} className="group h-10 py-0">
          <span className="num w-[88px] shrink-0 text-[13px] text-ink-2">{v.plannedDate === today ? "Today" : istDay(v.plannedDate)}{v.plannedTime ? ` ${v.plannedTime}` : ""}</span>
          {showShop && <span className="min-w-0 flex-1 truncate font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline">{v.shop.name}</span>}
          {showAgent && <span className={cn("flex min-w-0 items-center gap-2 truncate", !showShop && "flex-1")}><Avatar name={v.agent.name} size={18} /><span className="truncate">{v.agent.name}</span></span>}
          <span className="hidden w-[110px] shrink-0 md:block"><StatusDot map={VISIT_STATUS} value={v.status} className="text-[13px]" /></span>
          <span className="hidden w-[130px] shrink-0 lg:block">{v.proofState !== "NOT_STARTED" ? <StatusDot map={PROOF} value={v.proofState} className="text-[13px]" /> : <span className="text-[13px] text-ink-3">—</span>}</span>
          <span className="num hidden w-14 shrink-0 text-right text-[13px] text-ink-2 sm:block">{fmtDist(v.checkInDistanceM) ?? "—"}</span>
          <span className="num w-[72px] shrink-0 text-right text-[13px]">{v.outcome?.orderValuePaise ? formatINRCompact(v.outcome.orderValuePaise) : v.checkInAt ? <span className="text-ink-3">{istTime(v.checkInAt)}</span> : <span className="text-ink-3">—</span>}</span>
        </ListRow>
      ))}
    </ListCard>
  );
}
