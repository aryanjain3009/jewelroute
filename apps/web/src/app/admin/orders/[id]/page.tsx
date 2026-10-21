"use client";
/** Order record — Attio record layout: details panel left; Overview (highlights, rate snapshot, line items), History, Activity. */
import * as React from "react";
import { useParams } from "next/navigation";
import {
  ActivityIcon, BadgeCheckIcon, CalendarIcon, CheckIcon, CircleDotIcon, CoinsIcon, FileTextIcon, HashIcon, HistoryIcon,
  LayoutGridIcon, LockIcon, MapPinnedIcon, PackageIcon, ReceiptTextIcon, ScaleIcon, StoreIcon, UserIcon, XIcon,
} from "lucide-react";
import { formatGrams, formatINR, formatRate, formatRateDelta, PURITY_LABEL } from "@jewelroute/shared";
import { api } from "@/lib/api";
import type { AuditRow, Order } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, Btn, Empty } from "@/components/app/chrome";
import { Highlight, MainSection, Property, PropertySection, RecordHeader, RecordLayout, RecordTabs, useTab } from "@/components/app/record";
import { Timeline, type TimelineItem } from "@/components/app/timeline";
import { OBJECT_TINT } from "@/components/app/shell";
import { Textarea } from "@/components/ui/textarea";
import { useGoldRates, useOrderRecord, useWrite } from "@/components/admin-v2/sales/data";
import { ActivityTimeline } from "@/components/admin-v2/sales/activity";
import { auditTimelineItem } from "@/components/app/audit";
import { ErrorState, fmtDayTime, fmtDist, MiniTable, Modal, MTd, ObjectLead, OrderStatusDot, RecLink, RecordSkeleton, Thumb, useHydrated } from "@/components/admin-v2/sales/ui";

function OrderBody() {
  const { id } = useParams<{ id: string }>();
  const rec = useOrderRecord(id);
  const rates = useGoldRates();
  const tab = useTab("overview");
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const approve = useWrite(() => api<{ order: Order }>(`/admin/orders/${id}/approve`, { method: "POST" }), { changes: ["order.decided"], success: (r) => `${r.order.number} approved` });
  const reject = useWrite(() => api<{ order: Order }>(`/admin/orders/${id}/reject`, { body: { reason: reason.trim() } }), {
    changes: ["order.decided"], success: (r) => `${r.order.number} rejected`, onSuccess: () => { setRejecting(false); setReason(""); },
  });

  if (rec.error) return <ErrorState error={rec.error} retry={() => rec.refetch()} className="h-full" />;
  if (!rec.data) return <RecordSkeleton />;
  const { order: o, visit, history, activity } = rec.data;
  const pieces = o.items.reduce((a, i) => a + i.quantity, 0);
  const grams = o.items.reduce((a, i) => a + i.netWeightMg * i.quantity, 0);
  const lifecycle = historyItems(o, history);

  const panel = (
    <>
      <RecordHeader
        lead={<ObjectLead icon={ReceiptTextIcon} tint={OBJECT_TINT.orders} />}
        title={<span className="num">{o.number}</span>}
        subtitle={<>{o.shop.name}{o.shop.area ? ` · ${o.shop.area}` : ""}</>}
        primary={o.status === "SUBMITTED"
          ? <Btn variant="primary" icon={CheckIcon} disabled={approve.isPending} onClick={() => approve.mutate(undefined)}>{approve.isPending ? "Approving…" : "Approve order"}</Btn>
          : <div className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-sunken px-3 text-[13px] text-ink-2"><OrderStatusDot status={o.status} />{o.decidedAt && <span className="truncate">· {o.decidedBy ? `${o.decidedBy.name.split(" ")[0]}, ` : ""}{fmtDayTime(o.decidedAt)}</span>}</div>}
        actions={o.status === "SUBMITTED" ? <Btn variant="danger" icon={XIcon} onClick={() => setRejecting(true)}>Reject</Btn> : undefined}
      />
      <PropertySection title="Order details">
        <Property icon={HashIcon} label="Order number"><span className="num">{o.number}</span></Property>
        <Property icon={CircleDotIcon} label="Status"><OrderStatusDot status={o.status} /></Property>
        <Property icon={StoreIcon} label="Shop"><span className="flex items-center gap-2"><Avatar name={o.shop.name} square /><RecLink href={`/admin/shops/${o.shop.id}`}>{o.shop.name}</RecLink></span></Property>
        <Property icon={UserIcon} label="Agent"><span className="flex items-center gap-2"><Avatar name={o.agent.name} /><RecLink href={`/admin/agents/${o.agent.id}`}>{o.agent.name}</RecLink></span></Property>
        <Property icon={MapPinnedIcon} label="Source visit">
          {o.visitId ? (
            <span className="flex min-w-0 flex-col">
              <RecLink href={`/admin/visits/${o.visitId}`}>{visit?.checkInAt ? `Visit · ${fmtDayTime(visit.checkInAt)}` : "Open visit"}</RecLink>
              {visit?.verification && <span className="text-[13px] text-ink-3">{visit.verification === "VERIFIED" ? "GPS verified" : visit.verification === "SIMULATED" ? "Simulated check-in" : "Low GPS accuracy"}{visit.checkInDistanceM != null ? ` · ${fmtDist(visit.checkInDistanceM)} from shop` : ""}</span>}
            </span>
          ) : undefined}
        </Property>
        <Property icon={CalendarIcon} label="Created"><span className="num">{fmtDayTime(o.createdAt)}</span></Property>
        <Property icon={BadgeCheckIcon} label="Decided by">{o.decidedBy ? <span className="flex items-center gap-2"><Avatar name={o.decidedBy.name} />{o.decidedBy.name}</span> : undefined}</Property>
        <Property icon={CalendarIcon} label="Decided at">{o.decidedAt ? <span className="num">{fmtDayTime(o.decidedAt)}</span> : undefined}</Property>
        {o.status === "REJECTED" && <Property icon={FileTextIcon} label="Rejection reason"><span className="whitespace-pre-wrap text-danger">{o.rejectionReason}</span></Property>}
        <Property icon={FileTextIcon} label="Notes">{o.notes ? <span className="whitespace-pre-wrap">{o.notes}</span> : undefined}</Property>
      </PropertySection>
      <PropertySection title="Totals">
        <Property label="Subtotal"><span className="num">{formatINR(o.subtotalPaise)}</span></Property>
        <Property label="GST 3%"><span className="num">{formatINR(o.gstPaise)}</span></Property>
        <Property label="Total"><span className="num font-medium text-gold-ink">{formatINR(o.totalPaise)}</span></Property>
      </PropertySection>
    </>
  );

  return (
    <RecordLayout back={{ href: "/admin/orders", label: "Orders" }} panel={panel}>
      <RecordTabs tabs={[
        { value: "overview", label: "Overview", icon: LayoutGridIcon },
        { value: "history", label: "History", icon: HistoryIcon, count: lifecycle.length },
        { value: "activity", label: "Activity", icon: ActivityIcon, count: activity.length },
      ]} />
      {tab === "overview" && (
        <>
          <MainSection title="Highlights">
            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              <Highlight label="Total incl. GST" icon={CoinsIcon} tone="gold" sub={`${formatINR(o.subtotalPaise)} + ${formatINR(o.gstPaise)} GST`}><span className="num">{formatINR(o.totalPaise)}</span></Highlight>
              <Highlight label="Items" icon={PackageIcon} sub={`${o.items.length} design${o.items.length === 1 ? "" : "s"}`}><span className="num">{pieces} piece{pieces === 1 ? "" : "s"}</span></Highlight>
              <Highlight label="Gold weight" icon={ScaleIcon} sub="Net, all lines"><span className="num">{formatGrams(grams)}</span></Highlight>
              <Highlight label="Rate used" icon={LockIcon} sub={o.goldRateSnapshot.length > 1 ? `+${o.goldRateSnapshot.length - 1} more purity` : "Frozen at booking"}>
                {o.goldRateSnapshot[0] ? <span className="num">{PURITY_LABEL[o.goldRateSnapshot[0].purity]} {formatRate(o.goldRateSnapshot[0].ratePaisePerGram)}</span> : "—"}
              </Highlight>
            </div>
          </MainSection>
          <MainSection title="Rate snapshot">
            <RateSnapshot order={o} rates={rates.data} />
          </MainSection>
          <MainSection title="Line items" count={o.items.length}>
            <LineItems order={o} />
          </MainSection>
        </>
      )}
      {tab === "history" && (
        <MainSection title="History">
          <Timeline items={lifecycle} empty={<Empty icon={HistoryIcon} title="No history yet" />} />
          {!history.length && lifecycle.length > 0 && <p className="mt-4 text-[12.5px] text-ink-3">Built from the order record. Audit entries appear here for every approval or rejection.</p>}
        </MainSection>
      )}
      {tab === "activity" && (
        <MainSection title="Activity">
          <ActivityTimeline items={activity} selfId={o.id} empty={<Empty icon={ActivityIcon} title="No events for this order yet" hint="Webhook events such as order.created and order.approved show up here." />} />
        </MainSection>
      )}
      <Modal
        open={rejecting}
        onOpenChange={setRejecting}
        title={`Reject ${o.number}?`}
        description={<>{o.agent.name} sees the reason in the field app. The order stays on record with its frozen prices.</>}
        footer={<><Btn variant="ghost" onClick={() => setRejecting(false)}>Cancel</Btn><Btn variant="primary" className="bg-danger hover:bg-danger/90" disabled={reason.trim().length < 3 || reject.isPending} onClick={() => reject.mutate(undefined)}>{reject.isPending ? "Rejecting…" : "Reject order"}</Btn></>}
      >
        <label className="block text-[13px] font-medium text-ink" htmlFor="reject-reason">Reason</label>
        <Textarea id="reject-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Retailer's credit limit exceeded; re-book after payment" className="mt-1.5 min-h-20 border-line-strong text-[14px]" maxLength={500} />
      </Modal>
    </RecordLayout>
  );
}

function LineItems({ order: o }: { order: Order }) {
  // Stones / other only get a column when some line has them, so the breakdown fits the record column.
  const hasStone = o.items.some((i) => i.stonePaise > 0), hasOther = o.items.some((i) => i.otherPaise > 0);
  const money = (p: number) => (p ? formatINR(p) : "—");
  return (
    <>
      <MiniTable minWidth={hasStone && hasOther ? 820 : 720} head={[
        { label: "Item" }, { label: "Net wt", align: "right", width: 74 }, { label: "Gold value", align: "right", width: 96 }, { label: "Making", align: "right", width: 80 },
        ...(hasStone ? [{ label: "Stones", align: "right" as const, width: 78 }] : []), ...(hasOther ? [{ label: "Other", align: "right" as const, width: 72 }] : []),
        { label: "Unit price", align: "right", width: 96 }, { label: "Qty", align: "right", width: 44 }, { label: "Line total", align: "right", width: 104 },
      ]}>
        {o.items.map((it) => (
          <tr key={it.id} className="hover:bg-hover">
            <MTd className="overflow-hidden">
              <span className="flex min-w-0 items-center gap-2.5">
                <Thumb src={it.imageUrl} alt={it.name} size={24} />
                <span className="min-w-0"><span className="block truncate font-medium text-ink">{it.name}</span><span className="flex items-center gap-1.5 text-[12px] text-ink-3">{it.sku}<span aria-hidden>·</span><span className="text-gold-ink">{PURITY_LABEL[it.purity]}</span></span></span>
              </span>
            </MTd>
            <MTd align="right" className="num">{formatGrams(it.netWeightMg)}</MTd>
            <MTd align="right" className="num" title={`${formatGrams(it.netWeightMg)} × ${formatRate(it.ratePaisePerGram)}`}>{formatINR(it.goldValuePaise)}</MTd>
            <MTd align="right" className="num">{money(it.makingPaise)}</MTd>
            {hasStone && <MTd align="right" className={cn("num", !it.stonePaise && "text-ink-3")}>{money(it.stonePaise)}</MTd>}
            {hasOther && <MTd align="right" className={cn("num", !it.otherPaise && "text-ink-3")}>{money(it.otherPaise)}</MTd>}
            <MTd align="right" className="num">{formatINR(it.unitPricePaise)}</MTd>
            <MTd align="right" className="num">{it.quantity}</MTd>
            <MTd align="right" className="num font-medium text-gold-ink">{formatINR(it.lineTotalPaise)}</MTd>
          </tr>
        ))}
      </MiniTable>
      <div className="mt-3 flex flex-col-reverse items-start justify-between gap-3 sm:flex-row">
        <p className="max-w-sm text-[12.5px] text-ink-3">Gold value = net weight × the frozen rate. Unit price adds making, stones and other components, before GST.</p>
        <dl className="w-full shrink-0 text-[14px] sm:w-64">
          <div className="flex h-7 items-center justify-between text-ink-2"><dt>Subtotal</dt><dd className="num text-ink">{formatINR(o.subtotalPaise)}</dd></div>
          <div className="flex h-7 items-center justify-between text-ink-2"><dt>GST 3%</dt><dd className="num text-ink">{formatINR(o.gstPaise)}</dd></div>
          <div className="mt-1 flex h-9 items-center justify-between border-t border-line font-medium"><dt>Total</dt><dd className="num font-semibold text-gold-ink">{formatINR(o.totalPaise)}</dd></div>
        </dl>
      </div>
    </>
  );
}

function RateSnapshot({ order: o, rates }: { order: Order; rates?: { current: { purity: string; ratePaisePerGram: number }[]; history: { goldRateId: string; effectiveFrom: string; createdBy?: { name: string } | null }[] } }) {
  return (
    <div className="divide-y divide-line rounded-[10px] border border-line">
      {o.goldRateSnapshot.map((s) => {
        const set = rates?.history.find((h) => h.goldRateId === s.goldRateId);
        const today = rates?.current.find((c) => c.purity === s.purity);
        const delta = today ? today.ratePaisePerGram - s.ratePaisePerGram : 0;
        return (
          <div key={s.goldRateId} className="flex items-start gap-3 px-4 py-3.5">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-gold-soft text-gold-ink"><LockIcon className="size-3.5" strokeWidth={2} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-ink">
                Priced at <span className="font-medium">{PURITY_LABEL[s.purity]}</span> <span className="num font-medium text-gold-ink">{formatRate(s.ratePaisePerGram)}</span>
                <span className="text-ink-2">, set {fmtDayTime(set?.effectiveFrom ?? s.effectiveFrom)}{set?.createdBy?.name ? ` by ${set.createdBy.name}` : ""}</span>
              </p>
              <p className="mt-0.5 text-[13px] text-ink-2">
                {today ? (
                  delta === 0 ? <>Today&apos;s {PURITY_LABEL[s.purity]} rate is the same. </> :
                  <>Today&apos;s {PURITY_LABEL[s.purity]} rate is <span className="num text-ink">{formatRate(today.ratePaisePerGram)}</span> <span className="num">({formatRateDelta(delta)})</span>. </>
                ) : null}
                This order&apos;s totals never change.
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function historyItems(o: Order, history: AuditRow[]): TimelineItem[] {
  if (history.length) {
    // The API summary carries the rejection reason; refs link the shop, memo and visit.
    return [...history].reverse().map((h) => auditTimelineItem(h, o.id));
  }
  const items: TimelineItem[] = [{ id: "created", at: o.createdAt, lead: <Avatar name={o.agent.name} />, text: <><b>{o.agent.name}</b> booked this order at <b>{o.shop.name}</b></> }];
  if (o.decidedAt && o.decidedBy) items.unshift({
    id: "decided", at: o.decidedAt, lead: <Avatar name={o.decidedBy.name} />,
    text: <><b>{o.decidedBy.name}</b> {o.status === "APPROVED" ? "approved" : "rejected"} this order</>,
    body: o.rejectionReason ? <p className="text-[13px] text-ink-2">{o.rejectionReason}</p> : undefined,
  });
  return items;
}

function OrderInner() {
  const hydrated = useHydrated();
  return hydrated ? <OrderBody /> : <RecordSkeleton />;
}

export default function OrderRecordPage() {
  return <React.Suspense fallback={<RecordSkeleton />}><OrderInner /></React.Suspense>;
}
