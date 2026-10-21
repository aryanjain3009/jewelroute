"use client";
/** Memo record — exact pieces + the custody timeline (Vault → agent → retailer) with GPS, visit, proof and event ids. */
import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ActivityIcon, CalendarClockIcon, CalendarIcon, CalendarPlusIcon, CircleDotIcon, CoinsIcon, FileTextIcon, HistoryIcon,
  ListOrderedIcon, MapPinnedIcon, ScrollTextIcon, ShieldAlertIcon, ShieldCheckIcon, StoreIcon, UndoIcon, UserIcon,
} from "lucide-react";
import { addDays, daysBetween, formatGrams, formatINR, istDate, PURITY_LABEL } from "@jewelroute/shared";
import { api } from "@/lib/api";
import type { Memo, MemoItem, MemoRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, Btn, Chip, Dot, Empty } from "@/components/app/chrome";
import { MainSection, Property, PropertySection, RecordHeader, RecordLayout, RecordTabs, useTab } from "@/components/app/record";
import { Timeline } from "@/components/app/timeline";
import { OBJECT_TINT } from "@/components/app/shell";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { useMemoRecord, useWrite } from "@/components/admin-v2/sales/data";
import { ActivityFeed } from "@/components/app/activity-feed";
import { auditTimelineItem } from "@/components/app/audit";
import { CustodyTimeline } from "@/components/admin-v2/sales/custody-timeline";
import { DueText, ErrorState, fmtDay, fmtDayTime, fmtDist, holderLabel, MemoStatusDot, Modal, ObjectLead, RecLink, RecordSkeleton, Thumb, useHydrated } from "@/components/admin-v2/sales/ui";
import { useDocTitle } from "@/lib/title";
import { useUrlState } from "@/lib/url-state";
import { MEMO_STATUS, SelfAckNote, SIMULATED_LOCATION, StatusChip } from "@/components/app/status";

const isOpen = (m: Memo) => m.status === "ACTIVE" || m.status === "PARTIALLY_RETURNED";
const ACK: Record<string, string> = { QR_CONFIRM: "Retailer confirmed on their phone", OTP: "Retailer read out the 6-digit code" };
const ITEM: Record<MemoItem["status"], [React.ComponentProps<typeof Dot>["tone"], string]> = { OUT: ["gold", "Out"], RETURNED: ["grey", "Returned"], CONVERTED: ["green", "Converted"] };

function MemoBody() {
  const { id } = useParams<{ id: string }>();
  const rec = useMemoRecord(id);
  useDocTitle(rec.data?.memo.number);
  const tab = useTab("overview");
  const [extending, setExtending] = React.useState(false);
  // ?extend=1 (from a sample's "Extend due date") opens the dialog once for an open memo, then leaves the URL.
  const [extendParam, setExtendParam] = useUrlState("extend");
  const memoOpen = rec.data ? isOpen(rec.data.memo) : false;
  React.useEffect(() => {
    if (extendParam !== "1" || !rec.data) return;
    if (memoOpen) setExtending(true);
    setExtendParam("");
  }, [extendParam, memoOpen, rec.data, setExtendParam]);

  if (rec.error) return <ErrorState error={rec.error} retry={() => rec.refetch()} className="h-full" />;
  if (!rec.data) return <RecordSkeleton />;
  const { memo: m, custody, visit, history, activity } = rec.data;
  const out = m.items.filter((i) => i.status === "OUT");
  const holders = m.items.map((i) => ({ pieceId: i.piece.id, tagCode: i.piece.tagCode, label: holderLabel(i.piece) }));
  const open = isOpen(m);

  const panel = (
    <>
      <RecordHeader
        lead={<ObjectLead icon={ScrollTextIcon} tint={OBJECT_TINT.memos} />}
        title={<span className="num">{m.number}</span>}
        subtitle={<>{m.shop.name}{m.shop.area ? ` · ${m.shop.area}` : ""}</>}
        primary={open
          ? <Btn icon={CalendarPlusIcon} onClick={() => setExtending(true)}>Extend due date</Btn>
          : <div className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-sunken px-3 text-[13px] text-ink-2"><MemoStatusDot status={m.displayStatus} /></div>}
      />
      {open && (
        <p className="flex items-start gap-2 border-b border-line px-5 py-3 text-[13px] text-ink-2">
          <UndoIcon className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
          <span>Returns are recorded by {m.agent.name} in the field app when the pieces are collected at the shop, so custody always moves with the person holding them.</span>
        </p>
      )}
      <PropertySection title="Memo details" collapseBelowLg>
        <Property icon={CircleDotIcon} label="Status"><MemoStatusDot status={m.displayStatus} /></Property>
        <Property icon={StoreIcon} label="Retailer"><span className="flex items-center gap-2"><Avatar name={m.shop.name} square /><RecLink href={`/admin/shops/${m.shop.id}`}>{m.shop.name}</RecLink></span></Property>
        <Property icon={UserIcon} label="Agent"><span className="flex items-center gap-2"><Avatar name={m.agent.name} /><RecLink href={`/admin/agents/${m.agent.id}`}>{m.agent.name}</RecLink></span></Property>
        <Property icon={CoinsIcon} label="Value"><span className="num">{formatINR(m.totalValuePaise)}</span></Property>
        <Property icon={CoinsIcon} label="Outstanding"><span className="num font-medium text-gold-ink">{formatINR(m.outstandingValuePaise)}</span><span className="text-[13px] text-ink-3"> · {out.length} of {m.items.length} pieces</span></Property>
        <Property icon={CalendarIcon} label="Issued"><span className="num">{fmtDayTime(m.issuedAt)}</span></Property>
        <Property icon={CalendarClockIcon} label="Due date"><span className="num">{fmtDay(m.dueDate)}</span>{open && <> <DueText days={m.daysToDue} /></>}</Property>
        {m.extensions.length > 0 && (
          <Property icon={CalendarPlusIcon} label="Extensions">
            <span className="flex flex-col gap-0.5">{m.extensions.map((x, i) => <span key={i} className="text-[13px]"><span className="num">{fmtDay(x.fromDueDate)} → {fmtDay(x.toDueDate)}</span>{x.reason && <span className="text-ink-3"> · {x.reason}</span>}</span>)}</span>
          </Property>
        )}
        <Property icon={ShieldCheckIcon} label="Acknowledged">
          {m.ackStatus === "ACKNOWLEDGED"
            ? <span className="flex flex-col"><Dot tone="green">By {m.shop.name} {m.ackMethod === "OTP" ? "by 6-digit code" : "via QR"}</Dot><span className="text-[13px] text-ink-3">{m.ackAt ? `${fmtDayTime(m.ackAt)} · ` : ""}{m.ackMethod ? ACK[m.ackMethod] ?? "" : ""}</span>{m.selfAckSuspected && <SelfAckNote className="mt-0.5" />}</span>
            : <Dot tone="amber">Waiting for the retailer</Dot>}
        </Property>
        <Property icon={MapPinnedIcon} label="Source visit">
          {m.visitId ? (
            <span className="flex min-w-0 flex-col">
              <RecLink href={`/admin/visits/${m.visitId}`}>{visit?.checkInAt ? `Visit · ${fmtDayTime(visit.checkInAt)}` : "Open visit"}</RecLink>
              {visit?.verification && <span className="text-[13px] text-ink-3">{visit.verification === "SIMULATED" ? SIMULATED_LOCATION : <>{visit.verification === "VERIFIED" ? "GPS verified" : "Low GPS accuracy"}{visit.checkInDistanceM != null ? ` · ${fmtDist(visit.checkInDistanceM)} from shop` : ""}</>}</span>}
            </span>
          ) : undefined}
        </Property>
        <Property icon={FileTextIcon} label="Notes">{m.notes ? <span className="whitespace-pre-wrap">{m.notes}</span> : undefined}</Property>
      </PropertySection>
    </>
  );

  return (
    <RecordLayout back={{ href: "/admin/memos", label: "Memos" }} crumb={<span className="num">{m.number}</span>} panel={panel}>
      <RecordTabs tabs={[
        { value: "overview", label: "Memo", icon: FileTextIcon },
        { value: "custody", label: "Custody", icon: ListOrderedIcon, count: custody.length },
        { value: "history", label: "History", icon: HistoryIcon, count: history.length },
        { value: "activity", label: "Activity", icon: ActivityIcon, count: activity.length },
      ]} />
      {tab === "overview" && (
        <div className="px-6 py-5">
          <MemoDocument m={m} out={out} visitAt={visit?.checkInAt} />
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
            <ListOrderedIcon className="size-4 text-ink-3" />
            <span>Every hand-over of these pieces is in the custody ledger.</span>
            <Link href={`/admin/memos/${m.id}?tab=custody`} replace scroll={false} className="font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 hover:underline">Open custody</Link>
          </div>
        </div>
      )}
      {tab === "custody" && (
        <MainSection title="Custody" count={custody.length}>
          <p className="-mt-1 mb-3 text-[13px] text-ink-2">Where these pieces have been, from the vault to the retailer. Every hand-over carries the GPS check-in it happened under and the event that announced it.</p>
          <CustodyTimeline events={custody} mode="memo" memoId={m.id} holders={holders} />
        </MainSection>
      )}
      {tab === "history" && (
        <MainSection title="History">
          <Timeline items={history.slice().reverse().map((h) => auditTimelineItem(h, m.id))} empty={<Empty icon={HistoryIcon} title="No audit entries yet" />} />
        </MainSection>
      )}
      {tab === "activity" && (
        <MainSection title="Activity">
          <ActivityFeed filter={{ memoId: m.id }} selfId={m.id} empty={<Empty icon={ActivityIcon} title="No events for this memo yet" hint="memo.created, memo.extended, memo.returned and memo.overdue events show up here." />} />
        </MainSection>
      )}
      {open && <ExtendDialog memo={m} open={extending} onOpenChange={setExtending} />}
    </RecordLayout>
  );
}

/** The memo as a document: who it was issued to and by, the terms, the itemised pieces with their
 *  values fixed at issue, the API's totals, and the retailer's acknowledgement as the signature line. */
function MemoDocument({ m, out, visitAt }: { m: MemoRow; out: MemoItem[]; visitAt?: string }) {
  const open = isOpen(m);
  const back = m.items.filter((i) => i.status === "RETURNED").length;
  const sold = m.items.filter((i) => i.status === "CONVERTED").length;
  return (
    <article className="overflow-hidden rounded-[12px] border border-line bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="text-[12.5px] text-ink-3">Approval memo</p>
          <h2 className="num mt-0.5 text-[18px] font-semibold tracking-[-0.01em] text-ink">{m.number}</h2>
        </div>
        <div className="flex items-center gap-2">
          {m.extended && <Chip tone="grey">Extended</Chip>}
          <StatusChip map={MEMO_STATUS} value={m.displayStatus} />
        </div>
      </header>
      <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
        <div className="bg-white px-5 py-3.5">
          <p className="text-[12.5px] text-ink-3">Issued to</p>
          <p className="mt-1.5 flex items-center gap-2 text-[14px] font-medium"><Avatar name={m.shop.name} size={20} square /><RecLink href={`/admin/shops/${m.shop.id}`}>{m.shop.name}</RecLink></p>
          <p className="mt-0.5 truncate pl-7 text-[13px] text-ink-2">{m.shop.area ?? "Retailer"}</p>
        </div>
        <div className="bg-white px-5 py-3.5">
          <p className="text-[12.5px] text-ink-3">Handed over by</p>
          <p className="mt-1.5 flex items-center gap-2 text-[14px] font-medium"><Avatar name={m.agent.name} size={20} /><RecLink href={`/admin/agents/${m.agent.id}`}>{m.agent.name}</RecLink></p>
          <p className="mt-0.5 truncate pl-7 text-[13px] text-ink-2">{m.visitId ? <RecLink href={`/admin/visits/${m.visitId}`} className="text-ink-2">{visitAt ? `On the visit, ${fmtDayTime(visitAt)}` : "On a visit"}</RecLink> : "Field agent"}</p>
        </div>
        <div className="bg-white px-5 py-3.5">
          <p className="text-[12.5px] text-ink-3">Terms</p>
          <dl className="mt-1.5 space-y-0.5 text-[13.5px]">
            <div className="flex gap-2"><dt className="w-14 shrink-0 text-ink-2">Issued</dt><dd className="num text-ink">{fmtDayTime(m.issuedAt)}</dd></div>
            <div className="flex gap-2"><dt className="w-14 shrink-0 text-ink-2">Due</dt><dd className="num flex flex-wrap items-baseline gap-x-1.5"><span className={cn("font-medium", open && m.daysToDue < 0 ? "text-danger" : "text-ink")}>{fmtDay(m.dueDate)}</span>{open && <DueText days={m.daysToDue} />}</dd></div>
            {m.extensions.map((x, i) => <div key={i} className="flex gap-2 text-[12.5px]"><dt className="w-14 shrink-0 text-ink-3">Moved</dt><dd className="num text-ink-3">{fmtDay(x.fromDueDate)} → {fmtDay(x.toDueDate)}{x.reason ? ` · ${x.reason}` : ""}</dd></div>)}
          </dl>
        </div>
      </div>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-[14px]">
          <thead>
            <tr className="text-[12.5px] text-ink-3">
              <th className="h-9 w-[168px] border-b border-line pl-5 pr-3 text-left font-normal">Piece</th>
              <th className="h-9 border-b border-line px-3 text-left font-normal">Design</th>
              <th className="h-9 w-[72px] border-b border-line px-3 text-left font-normal">Purity</th>
              <th className="h-9 w-[92px] border-b border-line px-3 text-right font-normal">Net wt</th>
              <th className="h-9 w-[124px] border-b border-line px-3 text-right font-normal">Value at issue</th>
              <th className="h-9 w-[132px] border-b border-line pl-3 pr-5 text-left font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {m.items.map((it) => (
              <tr key={it.id} className="transition-colors hover:bg-hover">
                <td className="h-11 border-b border-line pl-5 pr-3"><span className="flex items-center gap-2.5"><Thumb src={it.piece.imageUrl} alt={it.piece.name} size={28} /><RecLink href={`/admin/samples/${it.piece.id}`} className="num font-medium">{it.piece.tagCode}</RecLink></span></td>
                <td className="h-11 max-w-0 border-b border-line px-3"><span className="block truncate text-ink-2">{it.piece.name}</span></td>
                <td className="h-11 border-b border-line px-3 font-medium text-gold-ink">{PURITY_LABEL[it.piece.purity]}</td>
                <td className="num h-11 border-b border-line px-3 text-right">{formatGrams(it.piece.netWeightMg)}</td>
                <td className={cn("num h-11 border-b border-line px-3 text-right", it.status === "OUT" ? "font-medium text-ink" : "text-ink-3")}>{formatINR(it.valuePaise)}</td>
                <td className="h-11 border-b border-line pl-3 pr-5"><span className="flex items-baseline gap-1.5"><Dot tone={ITEM[it.status][0]}>{ITEM[it.status][1]}</Dot>{it.returnedAt && <span className="num text-[12px] text-ink-3">{fmtDay(it.returnedAt)}</span>}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col-reverse gap-4 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-xs text-[12.5px] leading-5 text-ink-3"><span className="text-ink-2">{out.length} of {m.items.length} out</span>{back ? ` · ${back} returned` : ""}{sold ? ` · ${sold} sold` : ""}<br />Values were fixed when the memo was issued.</p>
        <dl className="w-full shrink-0 text-[14px] sm:w-72">
          <div className="flex h-7 items-center justify-between text-ink-2"><dt>Memo value</dt><dd className="num text-ink">{formatINR(m.totalValuePaise)}</dd></div>
          <div className="mt-1 flex h-9 items-center justify-between border-t border-line"><dt className="font-medium text-ink">Outstanding</dt><dd className={cn("num text-[15px] font-semibold", open && m.daysToDue < 0 ? "text-danger" : "text-gold-ink")}>{formatINR(m.outstandingValuePaise)}</dd></div>
        </dl>
      </div>
      <footer className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-5 py-3.5 text-[13.5px]", m.ackStatus === "ACKNOWLEDGED" ? "border-line bg-[#fafafa]" : "border-warn/30 bg-warn-soft/40")}>
        {m.ackStatus === "ACKNOWLEDGED" ? (
          <>
            <ShieldCheckIcon className="size-4 shrink-0 text-verified" />
            <span className="text-ink">Acknowledged by <b className="font-medium">{m.shop.name}</b> {m.ackMethod === "OTP" ? "with the 6-digit code" : "via QR"}</span>
            {m.ackAt && <span className="num text-ink-3">{fmtDayTime(m.ackAt)}</span>}
            {m.ackMethod && ACK[m.ackMethod] && <span className="w-full pl-7 text-[12.5px] text-ink-3 sm:ml-auto sm:w-auto sm:pl-0">{ACK[m.ackMethod]}</span>}
            {m.selfAckSuspected && <span className="w-full pl-7"><SelfAckNote /></span>}
          </>
        ) : (
          <>
            <ShieldAlertIcon className="size-4 shrink-0 text-warn" />
            <span className="font-medium text-warn">Waiting for {m.shop.name} to acknowledge</span>
            <span className="text-ink-2">The retailer confirms receipt on their phone or with a 6-digit code.</span>
          </>
        )}
      </footer>
    </article>
  );
}

function ExtendDialog({ memo: m, open, onOpenChange }: { memo: MemoRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const today = istDate();
  const max = addDays(today, 90);
  const [date, setDate] = React.useState<string>("");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { if (open) { setDate(""); setReason(""); } }, [open]);
  const extend = useWrite(() => api<{ memo: Memo }>(`/admin/memos/${m.id}/extend`, { body: { dueDate: date, reason: reason.trim() || undefined } }), {
    changes: ["memo.extended"], success: (r) => `${r.memo.number} now due ${fmtDay(r.memo.dueDate)}`, onSuccess: () => onOpenChange(false),
  });
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const shift = date ? daysBetween(m.dueDate, date) : 0;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      width={420}
      title={`Extend ${m.number}`}
      description={<>Currently due <span className="num font-medium text-ink">{fmtDay(m.dueDate)}</span>. Pick a date up to 90 days from today. {m.agent.name} and the retailer see the new date.</>}
      footer={<><Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn><Btn variant="primary" disabled={!date || extend.isPending} onClick={() => extend.mutate(undefined)}>{extend.isPending ? "Saving…" : date ? `Extend to ${fmtDay(date)}` : "Extend"}</Btn></>}
    >
      <div className="flex justify-center rounded-[10px] border border-line">
        <Calendar
          mode="single"
          selected={date ? new Date(`${date}T12:00:00`) : undefined}
          defaultMonth={new Date(`${(date || m.dueDate)}T12:00:00`)}
          disabled={{ before: new Date(`${today}T00:00:00`), after: new Date(`${max}T23:59:59`) }}
          onSelect={(d) => d && setDate(ymd(d))}
        />
      </div>
      {date && <p className="mt-2 text-[13px] text-ink-2">New due date <span className="num font-medium text-ink">{fmtDay(date)}</span>{shift !== 0 && <span className="num text-ink-3"> ({shift > 0 ? "+" : ""}{shift} day{Math.abs(shift) === 1 ? "" : "s"})</span>}</p>}
      <label htmlFor="extend-reason" className="mt-3 block text-[13px] font-medium text-ink">Reason <span className="font-normal text-ink-3">(optional)</span></label>
      <Input id="extend-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Retailer showing the set at a wedding on Sunday" className="mt-1.5 h-8 border-line-strong text-[14px]" />
    </Modal>
  );
}

function MemoInner() {
  const hydrated = useHydrated();
  return hydrated ? <MemoBody /> : <RecordSkeleton />;
}

export default function MemoRecordPage() {
  return <React.Suspense fallback={<RecordSkeleton />}><MemoInner /></React.Suspense>;
}
