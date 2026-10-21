"use client";
/** Record previews for the Attio side panel (components/app/record-preview). Each reads the SAME query
 *  as its full record page (shared `qk` keys), so preview and page never disagree. Highlights first,
 *  then recent activity from the one feed, then the most useful related list. */
import * as React from "react";
import Link from "next/link";
import { CheckIcon, MapPinnedIcon, ReceiptTextIcon, ScrollTextIcon, ShieldCheckIcon, ShieldAlertIcon } from "lucide-react";
import { formatGrams, formatINR, formatINRCompact, istDate, PURITY_LABEL } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
import { Avatar, Btn } from "@/components/app/chrome";
import { Property } from "@/components/app/record";
import { ActivityFeed } from "@/components/app/activity-feed";
import { CreditFigures, ApprovalReasons } from "@/components/app/credit";
import { PreviewHeader, PreviewSection } from "@/components/app/record-preview";
import { MEMO_STATUS, ORDER_STATUS, PIECE_STATUS, PROOF, SHOP_STATUS, SelfAckNote, StatusChip, StatusDot, VISIT_STATUS, isPendingApproval, SIMULATED_LOCATION } from "@/components/app/status";
import { OBJECT_TINT } from "@/components/app/shell";
import { useMemoRecord, useOrderRecord, usePieceRecord } from "./sales/data";
import { WhereNow } from "./sales/where-now";
import { DueText, ErrorState, fmtDay, fmtDayTime, ObjectLead, RecLink, Thumb } from "./sales/ui";
import { RejectOrderDialog, useApproveOrder } from "./sales/order-actions";
import { useAgentRecord, useShopRecord, useVisitRecord } from "./field/data";
import { MemoRow, OrderRow } from "./field/visit-record";
import { CreditBlock, PieceLine } from "./field/shop-record";
import { daysAgo, fmtDist, istDay, istTime, mediaUrl, relDay, wallTime } from "./field/ui";

const Loading = () => (
  <div className="space-y-4 p-5" aria-busy>
    <div className="flex items-center gap-3"><span className="size-10 rounded-[10px] bg-hover" /><span className="h-4 w-48 animate-pulse rounded bg-hover" /></div>
    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex gap-6"><span className="h-3 w-28 animate-pulse rounded bg-hover" /><span className="h-3 w-40 animate-pulse rounded bg-hover" /></div>)}
  </div>
);
/** The API's own error (404 for a deleted or foreign id) with a retry — never an endless skeleton. */
const PreviewError = ({ q }: { q: { error: unknown; refetch: () => unknown } }) => <ErrorState error={q.error} retry={() => q.refetch()} />;
const Props = ({ children }: { children: React.ReactNode }) => <dl className="flex flex-col">{children}</dl>;
const Activity = ({ filter, selfId, href }: { filter: Record<string, string>; selfId: string; href: string }) => (
  <PreviewSection title="Activity" action={<Link href={`${href}?tab=activity`} className="text-[13px] text-ink-2 hover:text-ink">View all</Link>}>
    <ActivityFeed filter={filter} selfId={selfId} compact max={6} empty={<p className="text-[13px] text-ink-3">No activity yet.</p>} />
  </PreviewSection>
);

/* ---------------- Order ---------------- */
export function OrderPreview({ id }: { id: string }) {
  const q = useOrderRecord(id);
  const approve = useApproveOrder(id);
  const [rejecting, setRejecting] = React.useState(false);
  if (!q.data) return q.error ? <PreviewError q={q} /> : <Loading />;
  const o = q.data.order;
  const ap = o.approval;
  const pending = isPendingApproval(o.status);
  return (
    <>
      <PreviewHeader
        lead={<ObjectLead icon={ReceiptTextIcon} tint={OBJECT_TINT.orders} />}
        title={<span className="num">{o.number}</span>}
        subtitle={<>{o.shop.name}{o.shop.area ? ` · ${o.shop.area}` : ""} · {o.agent.name}</>}
        status={<StatusChip map={ORDER_STATUS} value={o.status} />}
        actions={pending ? <>
          <Btn variant="primary" icon={CheckIcon} disabled={approve.isPending} onClick={() => approve.mutate(undefined)}>{approve.isPending ? "Approving…" : "Approve"}</Btn>
          <Btn variant="danger" onClick={() => setRejecting(true)}>Reject…</Btn>
        </> : undefined}
      />
      {pending && <RejectOrderDialog order={o} open={rejecting} onOpenChange={setRejecting} />}
      {ap?.required && (
        <PreviewSection title={pending ? "Why it needs approval" : "Approval rule"}>
          <ApprovalReasons approval={ap} className="mb-2" />
          {ap.position && <CreditFigures p={ap.position} dense />}
        </PreviewSection>
      )}
      <PreviewSection title="Details">
        <Props>
          <Property label="Total incl. GST"><span className="num font-medium text-gold-ink">{formatINR(o.totalPaise)}</span></Property>
          <Property label="Items"><span className="num">{o.items.reduce((a, i) => a + i.quantity, 0)} pieces · {o.items.length} design{o.items.length === 1 ? "" : "s"}</span></Property>
          <Property label="Booked"><span className="num">{fmtDayTime(o.createdAt)}</span></Property>
          {!ap?.required && <Property label="Approval">{ap ? "Confirmed without approval" : undefined}</Property>}
          {o.decidedBy && <Property label="Decided"><span>{o.decidedBy.name}<span className="text-ink-3"> · {fmtDayTime(o.decidedAt)}</span></span></Property>}
          {(o.status === "CONFIRMED" || o.status === "APPROVED") && <Property label="Settlement">{o.settledAt ? <span>Settled <span className="text-ink-3">{fmtDayTime(o.settledAt)}</span></span> : <span className="text-warn">Unpaid</span>}</Property>}
        </Props>
      </PreviewSection>
      <Activity filter={{ orderId: o.id }} selfId={o.id} href={`/admin/orders/${o.id}`} />
    </>
  );
}

/* ---------------- Shop ---------------- */
export function ShopPreview({ id }: { id: string }) {
  const q = useShopRecord(id);
  if (!q.data) return q.error ? <PreviewError q={q} /> : <Loading />;
  const { shop: s, orders, pieces } = q.data;
  const up = s.upcomingVisit ?? s.nextVisit;
  const open = orders.filter((o) => isPendingApproval(o.status) || ((o.status === "CONFIRMED" || o.status === "APPROVED") && !o.settledAt));
  const unsettled = orders.filter((o) => (o.status === "CONFIRMED" || o.status === "APPROVED") && !o.settledAt).length;
  return (
    <>
      <PreviewHeader lead={<Avatar name={s.name} size={40} square className="rounded-[10px] text-[15px]" />} title={s.name} subtitle={`${s.area}, ${s.city}`} status={<StatusChip map={SHOP_STATUS} value={s.status} />} />
      <PreviewSection title="Credit position">
        <CreditBlock c={s.credit} limitPaise={s.creditLimitPaise} unsettled={unsettled} pending={orders.filter((o) => isPendingApproval(o.status)).length} memoCount={s.activeMemoCount} compact />
      </PreviewSection>
      <PreviewSection title="Highlights">
        <Props>
          <Property label="Assigned agent">{s.assignedAgent && <span className="flex items-center gap-2"><Avatar name={s.assignedAgent.name} />{s.assignedAgent.name}</span>}</Property>
          <Property label="Samples here">{s.samplesHereCount > 0 && <span className="num text-gold-ink">{s.samplesHereCount} piece{s.samplesHereCount === 1 ? "" : "s"} · {formatINRCompact(s.samplesHereValuePaise)}</span>}</Property>
          <Property label="Active memos">{s.activeMemoCount > 0 && <span className={cn("num", s.status === "MEMO_OVERDUE" ? "text-danger" : "text-gold-ink")}>{s.activeMemoCount} · {formatINRCompact(s.activeMemoValuePaise)}{s.status === "MEMO_OVERDUE" ? " · overdue" : ""}</span>}</Property>
          <Property label="Last visit">{s.lastVisitAt && <span className={cn((daysAgo(s.lastVisitAt) ?? 0) > 30 && "text-warn")}>{relDay(s.lastVisitAt)}{s.lastVisitAgent && <span className="text-ink-3"> · {s.lastVisitAgent.name}</span>}</span>}</Property>
          <Property label="Upcoming visit">{up && <span>{up.date === istDate() ? "Today" : istDay(up.date)}{up.plannedTime ? `, ${wallTime(up.plannedTime)}` : ""}<span className="text-ink-3"> · {up.agent.name}</span></span>}</Property>
        </Props>
      </PreviewSection>
      <Activity filter={{ shopId: s.id }} selfId={s.id} href={`/admin/shops/${s.id}`} />
      {open.length > 0 && <PreviewSection title="Open orders" count={open.length}><div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">{open.slice(0, 5).map((o) => <OrderRow key={o.id} o={o} />)}</div></PreviewSection>}
      {pieces.length > 0 && <PreviewSection title="Samples here" count={pieces.length}><div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">{pieces.slice(0, 5).map((p) => <PieceLine key={p.id} p={p} compact />)}</div></PreviewSection>}
    </>
  );
}

/* ---------------- Memo ---------------- */
export function MemoPreview({ id }: { id: string }) {
  const q = useMemoRecord(id);
  if (!q.data) return q.error ? <PreviewError q={q} /> : <Loading />;
  const m = q.data.memo;
  const open = m.status === "ACTIVE" || m.status === "PARTIALLY_RETURNED";
  return (
    <>
      <PreviewHeader lead={<ObjectLead icon={ScrollTextIcon} tint={OBJECT_TINT.memos} />} title={<span className="num">{m.number}</span>} subtitle={<>{m.shop.name} · {m.agent.name}</>} status={<StatusChip map={MEMO_STATUS} value={m.displayStatus} />} />
      <PreviewSection title="Highlights">
        <Props>
          <Property label="Outstanding"><span className="num font-medium text-gold-ink">{formatINR(m.outstandingValuePaise)}</span><span className="text-[13px] text-ink-3"> of {formatINRCompact(m.totalValuePaise)}</span></Property>
          <Property label="Due"><span className="num">{fmtDay(m.dueDate)}</span>{open && <> <DueText days={m.daysToDue} /></>}</Property>
          <Property label="Acknowledged">{m.ackStatus === "ACKNOWLEDGED"
            ? <span className="flex flex-col"><span className="inline-flex items-center gap-1.5"><ShieldCheckIcon className="size-4 text-verified" />{m.ackMethod === "OTP" ? "By code" : "Via QR"}{m.ackAt && <span className="text-ink-3"> · {fmtDayTime(m.ackAt)}</span>}</span>{m.selfAckSuspected && <SelfAckNote className="mt-0.5" />}</span>
            : <span className="inline-flex items-center gap-1.5 text-warn"><ShieldAlertIcon className="size-4" />Waiting for the retailer</span>}</Property>
          <Property label="Issued"><span className="num">{fmtDayTime(m.issuedAt)}</span></Property>
        </Props>
      </PreviewSection>
      <PreviewSection title="Pieces" count={m.items.length}>
        <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line text-[14px]">
          {m.items.map((it) => (
            <li key={it.id} className="flex h-10 items-center gap-2.5 px-3">
              <Thumb src={it.piece.imageUrl} alt={it.piece.name} size={24} />
              <RecLink href={`/admin/samples/${it.piece.id}`} className="num font-medium">{it.piece.tagCode}</RecLink>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-3">{it.piece.name}</span>
              <span className={cn("text-[12.5px]", it.status === "OUT" ? "text-gold-ink" : "text-ink-3")}>{it.status === "OUT" ? "Out" : it.status === "RETURNED" ? "Returned" : "Sold"}</span>
              <span className="num w-16 text-right text-[13px]">{formatINRCompact(it.valuePaise)}</span>
            </li>
          ))}
        </ul>
      </PreviewSection>
      <Activity filter={{ memoId: m.id }} selfId={m.id} href={`/admin/memos/${m.id}`} />
    </>
  );
}

/* ---------------- Sample ---------------- */
export function SamplePreview({ id }: { id: string }) {
  const q = usePieceRecord(id);
  const memo = useMemoRecord(q.data?.piece.memo?.id);
  if (!q.data) return q.error ? <PreviewError q={q} /> : <Loading />;
  const { piece: p, events } = q.data;
  return (
    <>
      <PreviewHeader
        lead={<Thumb src={p.imageUrl} alt={p.name} size={40} className="rounded-[10px]" />}
        title={<span className="num">{p.tagCode}</span>}
        subtitle={<span className="inline-flex min-w-0 items-center gap-1.5"><span className="truncate">{p.name}</span><span className="text-ink-3">·</span><span className="font-medium text-gold-ink">{PURITY_LABEL[p.purity]}</span><span className="text-ink-3">·</span><span className="num">{formatGrams(p.netWeightMg)}</span></span>}
        status={<StatusChip map={PIECE_STATUS} value={p.status} />}
      />
      <PreviewSection title="Now">
        <WhereNow p={p} events={events} memo={memo.data} compact />
      </PreviewSection>
      <PreviewSection title="Details">
        <Props>
          <Property label="Value today"><span className="num font-medium text-gold-ink">{formatINR(p.valuePaise)}</span></Property>
          <Property label="Weight"><span className="num">{formatGrams(p.netWeightMg)} net · {formatGrams(p.grossWeightMg)} gross</span></Property>
          <Property label="Ledger entries"><span className="num">{events.length}</span></Property>
        </Props>
      </PreviewSection>
      <Activity filter={{ pieceId: p.id }} selfId={p.id} href={`/admin/samples/${p.id}`} />
    </>
  );
}

/* ---------------- Visit ---------------- */
export function VisitPreview({ id }: { id: string }) {
  const q = useVisitRecord(id);
  if (!q.data) return q.error ? <PreviewError q={q} /> : <Loading />;
  const d = q.data; const r = d.row; const proof = d.proofs[0];
  return (
    <>
      <PreviewHeader lead={<ObjectLead icon={MapPinnedIcon} tint={OBJECT_TINT.visits} />} title={d.shop.name} subtitle={<>{(d.agent ?? r.agent).name} · {istDay(r.plannedDate)}{r.plannedTime ? `, ${wallTime(r.plannedTime)}` : ""}</>} status={<StatusChip map={VISIT_STATUS} value={r.status} />} />
      <PreviewSection title="Highlights">
        <Props>
          <Property label="Check-in">{r.checkInAt && <span>{istTime(r.checkInAt)}{r.verification === "SIMULATED" ? <span className="text-info"> · {SIMULATED_LOCATION}</span> : r.checkInDistanceM != null && <span className="text-ink-3"> · {fmtDist(r.checkInDistanceM)} from shop</span>}</span>}</Property>
          <Property label="Proof">{r.proofState !== "NOT_STARTED" ? <StatusDot map={PROOF} value={r.proofState} /> : undefined}</Property>
          <Property label="Orders">{r.outcome.orderCount > 0 && <span className="num">{r.outcome.orderCount} · {formatINRCompact(r.outcome.orderValuePaise)}</span>}</Property>
          <Property label="Memos">{r.outcome.memoCount > 0 && <span className="num text-gold-ink">{r.outcome.memoCount} · {formatINRCompact(r.outcome.memoValuePaise)}</span>}</Property>
          <Property label="Returned">{r.outcome.returnedCount > 0 && <span className="num">{r.outcome.returnedCount} piece{r.outcome.returnedCount === 1 ? "" : "s"}</span>}</Property>
        </Props>
        {proof && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(proof.url)} alt="Arrival photo" className="mt-3 aspect-[16/9] w-full rounded-[10px] border border-line object-cover" />
        )}
      </PreviewSection>
      <Activity filter={{ visitId: id }} selfId={id} href={`/admin/visits/${id}`} />
      {d.orders.length > 0 && <PreviewSection title="Orders" count={d.orders.length}><div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">{d.orders.map((o) => <OrderRow key={o.id} o={o} />)}</div></PreviewSection>}
      {d.memosCreated.length > 0 && <PreviewSection title="Memos" count={d.memosCreated.length}><div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">{d.memosCreated.map((m) => <MemoRow key={m.id} m={m} />)}</div></PreviewSection>}
    </>
  );
}

/* ---------------- Agent ---------------- */
export function AgentPreview({ id }: { id: string }) {
  const q = useAgentRecord(id);
  if (!q.data) return q.error ? <PreviewError q={q} /> : <Loading />;
  const { agent: a, today, bag, memos } = q.data;
  const done = today.filter((v) => v.status === "COMPLETED").length;
  const cur = today.find((v) => v.status === "CHECKED_IN" || v.status === "ACTIVE");
  return (
    <>
      <PreviewHeader lead={<Avatar name={a.name} size={40} />} title={a.name} subtitle={a.email} status={a.active ? undefined : <StatusDot map={{ OFF: ["grey", "Deactivated"] }} value="OFF" />} />
      <PreviewSection title="Today">
        <Props>
          <Property label="Route"><span className="num">{done} of {today.length} done</span></Property>
          <Property label="Now">{cur && <RecLink href={`/admin/visits/${cur.id}`}>At {cur.shop.name} since {istTime(cur.checkInAt)}</RecLink>}</Property>
          <Property label="Bag">{bag.length > 0 && <span className="num text-gold-ink">{bag.length} piece{bag.length === 1 ? "" : "s"}</span>}</Property>
          <Property label="Open memos">{memos.length > 0 && <span className="num">{memos.length}</span>}</Property>
        </Props>
      </PreviewSection>
      <Activity filter={{ agentId: a.id }} selfId={a.id} href={`/admin/agents/${a.id}`} />
    </>
  );
}
