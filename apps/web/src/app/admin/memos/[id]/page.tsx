"use client";
/** Memo record — exact pieces + the custody timeline (Vault → agent → retailer) with GPS, visit, proof and event ids. */
import * as React from "react";
import { useParams } from "next/navigation";
import {
  ActivityIcon, CalendarClockIcon, CalendarIcon, CalendarPlusIcon, CircleDotIcon, CoinsIcon, FileTextIcon, GemIcon, HistoryIcon,
  LayoutGridIcon, MapPinnedIcon, ShieldCheckIcon, StoreIcon, UndoIcon, UserIcon,
} from "lucide-react";
import { addDays, daysBetween, formatGrams, formatINR, istDate, PURITY_LABEL } from "@jewelroute/shared";
import { api } from "@/lib/api";
import type { Memo, MemoItem, MemoRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, Btn, Dot, Empty } from "@/components/app/chrome";
import { Highlight, MainSection, Property, PropertySection, RecordHeader, RecordLayout, RecordTabs, useTab } from "@/components/app/record";
import { Timeline } from "@/components/app/timeline";
import { OBJECT_TINT } from "@/components/app/shell";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { useMemoRecord, useWrite } from "@/components/admin-v2/sales/data";
import { ActivityTimeline } from "@/components/admin-v2/sales/activity";
import { auditTimelineItem } from "@/components/app/audit";
import { CustodyTimeline } from "@/components/admin-v2/sales/custody-timeline";
import { DueText, ErrorState, fmtDay, fmtDayTime, fmtDist, holderLabel, MemoStatusDot, MiniTable, Modal, MTd, ObjectLead, RecLink, RecordSkeleton, Thumb, useHydrated } from "@/components/admin-v2/sales/ui";

const isOpen = (m: Memo) => m.status === "ACTIVE" || m.status === "PARTIALLY_RETURNED";
const ACK: Record<string, string> = { QR_CONFIRM: "Retailer confirmed on their phone", OTP: "Retailer read out the 6-digit code" };
const ITEM: Record<MemoItem["status"], [React.ComponentProps<typeof Dot>["tone"], string]> = { OUT: ["gold", "Out"], RETURNED: ["grey", "Returned"], CONVERTED: ["green", "Converted"] };

function MemoBody() {
  const { id } = useParams<{ id: string }>();
  const rec = useMemoRecord(id);
  const tab = useTab("overview");
  const [extending, setExtending] = React.useState(false);

  if (rec.error) return <ErrorState error={rec.error} retry={() => rec.refetch()} className="h-full" />;
  if (!rec.data) return <RecordSkeleton />;
  const { memo: m, custody, visit, history, activity } = rec.data;
  const out = m.items.filter((i) => i.status === "OUT");
  const holders = m.items.map((i) => ({ pieceId: i.piece.id, tagCode: i.piece.tagCode, label: holderLabel(i.piece) }));
  const open = isOpen(m);

  const panel = (
    <>
      <RecordHeader
        lead={<ObjectLead icon={GemIcon} tint={OBJECT_TINT.memos} />}
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
      <PropertySection title="Memo details">
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
            ? <span className="flex flex-col"><Dot tone="green">{m.ackMethod === "OTP" ? "By 6-digit code" : "By QR confirmation"}</Dot><span className="text-[13px] text-ink-3">{m.ackAt ? `${fmtDayTime(m.ackAt)} · ` : ""}{m.ackMethod ? ACK[m.ackMethod] ?? "" : ""}</span></span>
            : <Dot tone="amber">Waiting for the retailer</Dot>}
        </Property>
        <Property icon={MapPinnedIcon} label="Source visit">
          {m.visitId ? (
            <span className="flex min-w-0 flex-col">
              <RecLink href={`/admin/visits/${m.visitId}`}>{visit?.checkInAt ? `Visit · ${fmtDayTime(visit.checkInAt)}` : "Open visit"}</RecLink>
              {visit?.verification && <span className="text-[13px] text-ink-3">{visit.verification === "VERIFIED" ? "GPS verified" : visit.verification === "SIMULATED" ? "Simulated check-in" : "Low GPS accuracy"}{visit.checkInDistanceM != null ? ` · ${fmtDist(visit.checkInDistanceM)} from shop` : ""}</span>}
            </span>
          ) : undefined}
        </Property>
        <Property icon={FileTextIcon} label="Notes">{m.notes ? <span className="whitespace-pre-wrap">{m.notes}</span> : undefined}</Property>
      </PropertySection>
    </>
  );

  return (
    <RecordLayout back={{ href: "/admin/memos", label: "Memos" }} panel={panel}>
      <RecordTabs tabs={[
        { value: "overview", label: "Overview", icon: LayoutGridIcon },
        { value: "history", label: "History", icon: HistoryIcon, count: history.length },
        { value: "activity", label: "Activity", icon: ActivityIcon, count: activity.length },
      ]} />
      {tab === "overview" && (
        <>
          <MainSection title="Highlights">
            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              <Highlight label="Outstanding" icon={CoinsIcon} tone="gold" sub={`Memo total ${formatINR(m.totalValuePaise)}`}><span className="num">{formatINR(m.outstandingValuePaise)}</span></Highlight>
              <Highlight label="Pieces out" icon={GemIcon} sub={m.items.length - out.length ? `${m.items.length - out.length} back or sold` : "None returned yet"}><span className="num">{out.length} of {m.items.length}</span></Highlight>
              <Highlight label="Due" icon={CalendarClockIcon} tone={open && m.daysToDue < 0 ? "danger" : undefined} sub={open ? <DueText days={m.daysToDue} className="text-[12.5px]" /> : "Closed"}><span className="num">{fmtDay(m.dueDate)}</span></Highlight>
              <Highlight label="Acknowledged" icon={ShieldCheckIcon} tone={m.ackStatus === "PENDING" ? "warn" : undefined} sub={m.ackAt ? fmtDayTime(m.ackAt) : "Retailer hasn't confirmed"}>{m.ackStatus === "ACKNOWLEDGED" ? (m.ackMethod === "OTP" ? "By code" : "By QR") : "Pending"}</Highlight>
            </div>
          </MainSection>
          <MainSection title="Pieces" count={m.items.length}>
            <MiniTable head={[{ label: "Piece" }, { label: "Design" }, { label: "Purity", width: 72 }, { label: "Net wt", align: "right", width: 84 }, { label: "Value", align: "right", width: 112 }, { label: "Status", width: 150 }]} minWidth={640}>
              {m.items.map((it) => (
                <tr key={it.id} className="hover:bg-hover">
                  <MTd><span className="flex items-center gap-2.5"><Thumb src={it.piece.imageUrl} alt={it.piece.name} size={28} /><RecLink href={`/admin/samples/${it.piece.id}`} className="num font-medium">{it.piece.tagCode}</RecLink></span></MTd>
                  <MTd className="overflow-hidden"><span className="block truncate">{it.piece.name}</span></MTd>
                  <MTd className="text-gold-ink">{PURITY_LABEL[it.piece.purity]}</MTd>
                  <MTd align="right" className="num">{formatGrams(it.piece.netWeightMg)}</MTd>
                  <MTd align="right" className={cn("num", it.status === "OUT" ? "font-medium text-gold-ink" : "text-ink-3")}>{formatINR(it.valuePaise)}</MTd>
                  <MTd><span className="flex items-baseline gap-1.5"><Dot tone={ITEM[it.status][0]}>{ITEM[it.status][1]}</Dot>{it.returnedAt && <span className="num text-[12px] text-ink-3">{fmtDay(it.returnedAt)}</span>}</span></MTd>
                </tr>
              ))}
            </MiniTable>
            <p className="mt-2 text-[12.5px] text-ink-3">Values were fixed when the memo was issued.</p>
          </MainSection>
          <MainSection title="Custody" count={custody.length}>
            <p className="-mt-1 mb-3 text-[13px] text-ink-2">Where these pieces have been, from the vault to the retailer. Every hand-over carries the GPS check-in it happened under and the event that announced it.</p>
            <CustodyTimeline events={custody} mode="memo" memoId={m.id} holders={holders} />
          </MainSection>
        </>
      )}
      {tab === "history" && (
        <MainSection title="History">
          <Timeline items={history.slice().reverse().map((h) => auditTimelineItem(h, m.id))} empty={<Empty icon={HistoryIcon} title="No audit entries yet" />} />
        </MainSection>
      )}
      {tab === "activity" && (
        <MainSection title="Activity">
          <ActivityTimeline items={activity} selfId={m.id} empty={<Empty icon={ActivityIcon} title="No events for this memo yet" hint="memo.created, memo.extended, memo.returned and memo.overdue events show up here." />} />
        </MainSection>
      )}
      {open && <ExtendDialog memo={m} open={extending} onOpenChange={setExtending} />}
    </RecordLayout>
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
