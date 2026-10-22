"use client";
/** Order record — Attio record layout: details panel left; Overview (highlights, rate snapshot, line items), History, Activity. */
import * as React from "react";
import { useParams } from "next/navigation";
import {
  ActivityIcon, BadgeCheckIcon, CalendarIcon, CheckIcon, CoinsIcon, FileTextIcon, HashIcon, HistoryIcon,
  LayoutGridIcon, LockIcon, MapPinnedIcon, PackageIcon, ReceiptTextIcon, ScaleIcon, StoreIcon, UserIcon, XIcon, WalletIcon, BanIcon, ShieldCheckIcon, ShieldAlertIcon,
} from "lucide-react";
import { formatGrams, formatINR, formatINRCompact, formatRate, formatRateDelta, PURITY_LABEL } from "@jewelroute/shared";
import { api } from "@/lib/api";
import type { AuditRow, Order } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, Btn, Empty } from "@/components/app/chrome";
import { Highlight, MainSection, Property, PropertySection, RecordHeader, RecordLayout, RecordTabs, useTab } from "@/components/app/record";
import { Timeline, type TimelineItem } from "@/components/app/timeline";
import { OBJECT_TINT } from "@/components/app/shell";
import { Textarea } from "@/components/ui/textarea";
import { useGoldRates, useOrderRecord, useWrite } from "@/components/admin-v2/sales/data";
import { RejectOrderDialog, useApproveOrder } from "@/components/admin-v2/sales/order-actions";
import { useUrlState } from "@/lib/url-state";
import { ActivityFeed } from "@/components/app/activity-feed";
import { auditTimelineItem } from "@/components/app/audit";
import { ErrorState, fmtDayTime, fmtDist, MiniTable, Modal, MTd, ObjectLead, RecLink, RecordSkeleton, Thumb, useHydrated } from "@/components/admin-v2/sales/ui";
import { isPendingApproval, ORDER_STATUS, OrderStatusDot, reasonsText, SIMULATED_LOCATION, StatusChip } from "@/components/app/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApprovalReasons, CreditFigures, ExposureBar } from "@/components/app/credit";
import { useDocTitle } from "@/lib/title";

function OrderBody() {
  const { id } = useParams<{ id: string }>();
  const rec = useOrderRecord(id);
  useDocTitle(rec.data?.order.number);
  const rates = useGoldRates();
  const tab = useTab("overview");
  // ?reject=1 (from a link) opens the reject dialog once for a pending order, then leaves the URL.
  const [rejectParam, setRejectParam] = useUrlState("reject");
  const [rejecting, setRejecting] = React.useState(false);
  const [dialog, setDialog] = React.useState<"settle" | "cancel" | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const settle = useWrite(() => api<{ order: Order }>(`/admin/orders/${id}/settle`, { method: "POST" }), {
    changes: ["order.settled"], success: (r) => `${r.order.number} marked as settled`, onSuccess: () => setDialog(null),
  });
  const cancel = useWrite(() => api<{ order: Order }>(`/admin/orders/${id}/cancel`, { body: { reason: cancelReason.trim() || undefined } }), {
    changes: ["order.cancelled"], success: (r) => `${r.order.number} cancelled`, onSuccess: () => { setDialog(null); setCancelReason(""); },
  });
  const approve = useApproveOrder(id);
  const status = rec.data?.order.status;
  React.useEffect(() => {
    if (rejectParam !== "1" || !status) return;
    if (isPendingApproval(status)) setRejecting(true);
    setRejectParam("");
  }, [rejectParam, status, setRejectParam]);

  if (rec.error) return <ErrorState error={rec.error} retry={() => rec.refetch()} className="h-full" />;
  if (!rec.data) return <RecordSkeleton />;
  const { order: o, visit, history, activity } = rec.data;
  const pieces = o.items.reduce((a, i) => a + i.quantity, 0);
  const grams = o.items.reduce((a, i) => a + i.netWeightMg * i.quantity, 0);
  const lifecycle = historyItems(o, history);
  const pending = isPendingApproval(o.status);
  const live = o.status === "CONFIRMED" || o.status === "APPROVED";
  const canCancel = (o.status === "CONFIRMED" || pending) && !o.settledAt && !o.sourceMemoId;
  const ap = o.approval;

  const panel = (
    <>
      <RecordHeader
        lead={<ObjectLead icon={ReceiptTextIcon} tint={OBJECT_TINT.orders} />}
        title={<span className="num">{o.number}</span>}
        subtitle={<span className="flex min-w-0 items-center gap-2"><span className="truncate" title={o.shop.area ? `${o.shop.name} · ${o.shop.area}` : o.shop.name}>{o.shop.name}</span><StatusChip map={ORDER_STATUS} value={o.status} /></span>}
        primary={pending
          ? <Btn variant="primary" icon={CheckIcon} disabled={approve.isPending} onClick={() => approve.mutate(undefined)}>{approve.isPending ? "Approving…" : "Approve order"}</Btn>
          : live && !o.settledAt ? <Btn variant="primary" icon={WalletIcon} onClick={() => setDialog("settle")}>Mark as settled</Btn>
          : <div className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-ink-2"><OrderStatusDot status={o.status} />{o.settledAt ? <span className="truncate">· settled {fmtDayTime(o.settledAt)}</span> : o.decidedAt ? <span className="truncate">· {o.decidedBy ? `${o.decidedBy.name.split(" ")[0]}, ` : ""}{fmtDayTime(o.decidedAt)}</span> : o.cancelledAt ? <span className="truncate">· {fmtDayTime(o.cancelledAt)}</span> : null}</div>}
        actions={<>
          {pending && <Btn variant="danger" icon={XIcon} onClick={() => setRejecting(true)}>Reject</Btn>}
          {canCancel && (pending
            ? <Tooltip><TooltipTrigger asChild><Btn icon={BanIcon} onClick={() => setDialog("cancel")} aria-label="Cancel order" /></TooltipTrigger><TooltipContent>Cancel order</TooltipContent></Tooltip>
            : <Btn icon={BanIcon} onClick={() => setDialog("cancel")} aria-label="Cancel order">Cancel</Btn>)}
        </>}
      />
      <PropertySection title="Order details">
        <Property icon={HashIcon} label="Order number"><span className="num">{o.number}</span></Property>
        <Property icon={StoreIcon} label="Shop"><span className="flex items-center gap-2"><Avatar name={o.shop.name} square /><RecLink href={`/admin/shops/${o.shop.id}`}>{o.shop.name}</RecLink></span></Property>
        <Property icon={UserIcon} label="Agent"><span className="flex items-center gap-2"><Avatar name={o.agent.name} /><RecLink href={`/admin/agents/${o.agent.id}`}>{o.agent.name}</RecLink></span></Property>
        <Property icon={MapPinnedIcon} label="Source visit">
          {o.visitId ? (
            <span className="flex min-w-0 flex-col">
              <RecLink href={`/admin/visits/${o.visitId}`}>{visit?.checkInAt ? `Visit · ${fmtDayTime(visit.checkInAt)}` : "Open visit"}</RecLink>
              {visit?.verification && <span className="text-[13px] text-ink-3">{visit.verification === "SIMULATED" ? SIMULATED_LOCATION : <>{visit.verification === "VERIFIED" ? "GPS verified" : "Low GPS accuracy"}{visit.checkInDistanceM != null ? ` · ${fmtDist(visit.checkInDistanceM)} from shop` : ""}</>}</span>}
            </span>
          ) : undefined}
        </Property>
        <Property icon={CalendarIcon} label="Created"><span className="num">{fmtDayTime(o.createdAt)}</span></Property>
        <Property icon={ShieldCheckIcon} label="Approval">{ap ? (ap.required ? <span className={cn(pending ? "text-warn" : "text-ink")}>{reasonsText(ap.reasons, ap.position)}</span> : "Not needed") : undefined}</Property>
        {(live || o.settledAt) && <Property icon={WalletIcon} label="Payment">{o.settledAt ? <span>Settled <span className="num text-ink-3">{fmtDayTime(o.settledAt)}</span></span> : "Unpaid"}</Property>}
        {o.status === "CANCELLED" && <Property icon={BanIcon} label="Cancelled"><span className="flex flex-col"><span className="num">{fmtDayTime(o.cancelledAt)}</span>{o.cancellationReason && <span className="whitespace-pre-wrap text-[13px] text-ink-2">{o.cancellationReason}</span>}</span></Property>}
        {(o.decidedBy || o.decidedAt) && <Property icon={BadgeCheckIcon} label="Decided by">{o.decidedBy ? <span className="flex flex-col"><span className="flex items-center gap-2"><Avatar name={o.decidedBy.name} />{o.decidedBy.name}</span>{o.decidedAt && <span className="num text-[13px] text-ink-3">{fmtDayTime(o.decidedAt)}</span>}</span> : undefined}</Property>}
        {o.status === "REJECTED" && <Property icon={FileTextIcon} label="Rejection reason"><span className="whitespace-pre-wrap text-danger">{o.rejectionReason}</span></Property>}
        <Property icon={FileTextIcon} label="Notes">{o.notes ? <span className="whitespace-pre-wrap">{o.notes}</span> : undefined}</Property>
      </PropertySection>
    </>
  );

  return (
    <RecordLayout back={{ href: "/admin/orders", label: "Orders" }} crumb={<span className="num">{o.number}</span>} panel={panel}>
      <RecordTabs tabs={[
        { value: "overview", label: "Overview", icon: LayoutGridIcon },
        { value: "history", label: "History", icon: HistoryIcon, count: lifecycle.length },
        { value: "activity", label: "Activity", icon: ActivityIcon, count: activity.length },
      ]} />
      {tab === "overview" && (
        <>
          {ap && <ApprovalBlock order={o} />}
          <MainSection title="Highlights">
            {/* The rate is told once, in Rate snapshot below; the total once here and once in the invoice footer. */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Highlight label="Total incl. GST" icon={CoinsIcon} tone="gold" sub={`${formatINR(o.gstPaise)} GST included`}><span className="num">{formatINR(o.totalPaise)}</span></Highlight>
              <Highlight label="Items" icon={PackageIcon} sub={`${o.items.length} design${o.items.length === 1 ? "" : "s"}`}><span className="num">{pieces} piece{pieces === 1 ? "" : "s"}</span></Highlight>
              <Highlight label="Gold weight" icon={ScaleIcon} sub="Net, all lines"><span className="num">{formatGrams(grams)}</span></Highlight>
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
          <ActivityFeed filter={{ orderId: o.id }} selfId={o.id} empty={<Empty icon={ActivityIcon} title="No events for this order yet" hint="Webhook events such as order.created and order.approved show up here." />} />
        </MainSection>
      )}
      {pending && <RejectOrderDialog order={o} open={rejecting} onOpenChange={setRejecting} />}
      <Modal
        open={dialog === "settle"}
        onOpenChange={(v) => setDialog(v ? "settle" : null)}
        title={`Mark ${o.number} as settled?`}
        description={<>Record that {o.shop.name} has paid <span className="num font-medium text-gold-ink">{formatINR(o.totalPaise)}</span>. It stops counting towards their outstanding and frees that much credit. Recorded with your name.</>}
        footer={<><Btn variant="ghost" onClick={() => setDialog(null)}>Not now</Btn><Btn variant="primary" disabled={settle.isPending} onClick={() => settle.mutate(undefined)}>{settle.isPending ? "Saving…" : "Mark as settled"}</Btn></>}
      />
      <Modal
        open={dialog === "cancel"}
        onOpenChange={(v) => setDialog(v ? "cancel" : null)}
        title={`Cancel ${o.number}?`}
        description={<>The order stays on record as cancelled with its frozen prices{live ? ", and stops counting towards the retailer's outstanding" : ""}. {o.agent.name} sees it in the field app.</>}
        footer={<><Btn variant="ghost" onClick={() => setDialog(null)}>Keep order</Btn><Btn variant="primary" className="bg-danger hover:bg-danger/90" disabled={cancel.isPending} onClick={() => cancel.mutate(undefined)}>{cancel.isPending ? "Cancelling…" : "Cancel order"}</Btn></>}
      >
        <label className="block text-[13px] font-medium text-ink" htmlFor="cancel-reason">Reason <span className="font-normal text-ink-3">(optional)</span></label>
        <Textarea id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Retailer called to drop the order" className="mt-1.5 min-h-16 border-line-strong text-[14px]" maxLength={500} />
      </Modal>
    </RecordLayout>
  );
}

/** The rule evaluation frozen when the order was written: why it needed approval (or didn't), with the
 *  five figures the approver decides on. Server-authoritative — rendered, never recomputed. */
function ApprovalBlock({ order: o }: { order: Order }) {
  const ap = o.approval!;
  const pending = isPendingApproval(o.status);
  const title = !ap.required ? "Confirmed without approval"
    : pending ? "Waiting for your approval"
    : o.status === "APPROVED" ? `Approved${o.decidedBy ? ` by ${o.decidedBy.name}` : ""}`
    : o.status === "REJECTED" ? `Rejected${o.decidedBy ? ` by ${o.decidedBy.name}` : ""}` : "Needed approval";
  const p = ap.position;
  return (
    <MainSection title="Credit check at booking">
      <div className={cn("grid gap-0 overflow-hidden rounded-[10px] border lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]", pending ? "border-warn/40" : "border-line")}>
        <div className={cn("flex flex-col gap-2 border-b border-line px-4 py-3.5 lg:border-b-0 lg:border-r", pending && "bg-warn-soft/40")}>
          <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
            {ap.required ? <ShieldAlertIcon className={cn("size-4", pending ? "text-warn" : "text-ink-3")} /> : <ShieldCheckIcon className="size-4 text-verified" />}{title}
          </p>
          {ap.required ? <ApprovalReasons approval={ap} /> : (
            <p className="text-[13px] text-ink-2">
              {p ? <>Within {p.creditLimitPaise ? `the ${formatINRCompact(p.creditLimitPaise)} credit limit` : "credit (no limit set)"}{p.approvalThresholdPaise != null ? ` and below the ${formatINRCompact(p.approvalThresholdPaise)} approval threshold` : ""}.</> : "No approval rule tripped when it was booked."}
            </p>
          )}
          {o.status === "REJECTED" && o.rejectionReason && <p className="text-[13px] text-danger">{o.rejectionReason}</p>}
          {p && p.creditLimitPaise > 0 && (
            <div className="pt-2">
              <ExposureBar p={p} className="h-2" />
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#55565a]" />Outstanding</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-gold" />On memo</span>
                <span className="inline-flex items-center gap-1.5"><span className={cn("h-1.5 w-2.5 rounded-full", p.projectedExposurePaise > p.creditLimitPaise ? "bg-danger/70" : "bg-[#9b9ca0]")} style={{ backgroundImage: "repeating-linear-gradient(135deg, rgb(255 255 255 / .55) 0 2px, transparent 2px 5px)" }} />This order</span>
                {p.projectedExposurePaise > p.creditLimitPaise && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-px bg-ink" />Limit</span>}
              </p>
            </div>
          )}
          <p className="pt-1 text-[12px] text-ink-3">Evaluated by the server when {o.agent.name} placed the order{p?.asOf ? `, ${fmtDayTime(p.asOf)}` : ""}.</p>
        </div>
        <div className="px-4 py-1.5">
          {p ? <CreditFigures p={p} /> : <p className="py-3 text-[13px] text-ink-3">This order was booked before credit checks were recorded.</p>}
        </div>
      </div>
    </MainSection>
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
                <span className="min-w-0"><span className="block font-medium leading-5 text-ink">{it.name}</span><span className="flex items-center gap-1.5 text-[12px] text-ink-3">{it.sku}<span aria-hidden>·</span><span className="text-gold-ink">{PURITY_LABEL[it.purity]}</span></span></span>
              </span>
            </MTd>
            <MTd align="right" className="num">{formatGrams(it.netWeightMg)}</MTd>
            <MTd align="right" className="num" title={`${formatGrams(it.netWeightMg)} × ${formatRate(it.ratePaisePerGram)}`}>{formatINR(it.goldValuePaise)}</MTd>
            <MTd align="right" className="num">{money(it.makingPaise)}</MTd>
            {hasStone && <MTd align="right" className={cn("num", !it.stonePaise && "text-ink-3")}>{money(it.stonePaise)}</MTd>}
            {hasOther && <MTd align="right" className={cn("num", !it.otherPaise && "text-ink-3")}>{money(it.otherPaise)}</MTd>}
            <MTd align="right" className="num">{formatINR(it.unitPricePaise)}</MTd>
            <MTd align="right" className="num">{it.quantity}</MTd>
            <MTd align="right" className="num font-medium text-ink">{formatINR(it.lineTotalPaise)}</MTd>
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
                <span className="text-ink-2"> — the rate row in force at booking (effective {fmtDayTime(s.effectiveFrom)}{set?.createdBy?.name ? `, set by ${set.createdBy.name}` : ""})</span>
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
