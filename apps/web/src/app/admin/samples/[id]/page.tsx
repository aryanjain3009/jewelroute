"use client";
/** Sample record — one physical piece: photo, properties, and its complete immutable custody ledger. */
import * as React from "react";
import { useParams } from "next/navigation";
import {
  ActivityIcon, ArchiveRestoreIcon, BoxesIcon, CircleDotIcon, ClockIcon, CoinsIcon, GemIcon, HashIcon, LandmarkIcon, ListOrderedIcon,
  MapPinIcon, ScaleIcon, ScrollTextIcon, SendIcon, TagIcon, UserIcon,
} from "lucide-react";
import { formatGrams, formatINR, formatRate, istDate, PURITY_LABEL } from "@jewelroute/shared";
import type { PieceRow } from "@/lib/types";
import { Avatar, Btn, Empty } from "@/components/app/chrome";
import { Highlight, MainSection, Property, PropertySection, RecordHeader, RecordLayout, RecordTabs, useTab } from "@/components/app/record";
import { relTime } from "@/components/app/timeline";
import { usePieceRecord } from "@/components/admin-v2/sales/data";
import { ActivityTimeline } from "@/components/admin-v2/sales/activity";
import { CustodyTimeline } from "@/components/admin-v2/sales/custody-timeline";
import { IssueDialog, ReturnDialog } from "@/components/admin-v2/sales/piece-actions";
import { DueText, ErrorState, fmtDay, fmtDayTime, holderLabel, PieceStatusDot, RecLink, RecordSkeleton, Thumb, useHydrated } from "@/components/admin-v2/sales/ui";

function HolderLead({ p }: { p: PieceRow }) {
  if (p.custodianType === "AGENT") return <Avatar name={holderLabel(p)} />;
  if (p.custodianType === "SHOP") return <Avatar name={holderLabel(p)} square />;
  return <span className="grid size-5 place-items-center rounded-[5px] bg-[#f1f1f2] text-ink-2"><LandmarkIcon className="size-3" strokeWidth={2} /></span>;
}

/** Where an agent-held piece is, exactly as the API resolved it (open visit → last check-in → field bag). */
function AgentLocation({ p }: { p: PieceRow }) {
  const l = p.location;
  if (!l) return <span className="text-ink-3">No value</span>;
  if (l.kind === "IN_VISIT") return (
    <span className="flex flex-col">
      {l.visitId ? <RecLink href={`/admin/visits/${l.visitId}`}>{l.label}</RecLink> : <span>{l.label}</span>}
      <span className="text-[13px] text-ink-3">{l.at ? `Checked in ${fmtDayTime(l.at)}` : "Checked in"}{l.verification === "SIMULATED" ? " · simulated location" : l.verification === "LOW_ACCURACY" ? " · low GPS accuracy" : l.verification === "VERIFIED" ? " · GPS verified" : ""}</span>
    </span>
  );
  if (l.kind === "LAST_CHECK_IN") return <span className="flex flex-col"><span>{l.label}</span>{l.visitId && <RecLink href={`/admin/visits/${l.visitId}`} className="text-[13px]">Open that visit</RecLink>}</span>;
  return <span>{l.label}</span>;
}

function SampleBody() {
  const { id } = useParams<{ id: string }>();
  const rec = usePieceRecord(id);
  const tab = useTab("ledger");
  const [dialog, setDialog] = React.useState<"issue" | "return" | null>(null);
  const today = istDate();

  if (rec.error) return <ErrorState error={rec.error} retry={() => rec.refetch()} className="h-full" />;
  if (!rec.data) return <RecordSkeleton />;
  const { piece: p, design: d, events, activity } = rec.data;
  const holder = holderLabel(p);
  const holderHref = p.custodianType === "AGENT" && p.custodian.agentId ? `/admin/agents/${p.custodian.agentId}` : p.custodianType === "SHOP" && p.custodian.shopId ? `/admin/shops/${p.custodian.shopId}` : undefined;
  const lastHandover = [...events].reverse().find((e) => e.location);
  const rate = d.price && d.price.purity === p.purity ? d.price.ratePaisePerGram : undefined;
  const memoDays = p.memo ? Math.round((+new Date(`${p.memo.dueDate}T00:00:00+05:30`) - +new Date(`${today}T00:00:00+05:30`)) / 86_400_000) : 0;

  const location: React.ReactNode =
    p.custodianType === "SHOP" ? <span className="flex flex-col"><span>At {holder}</span>{lastHandover?.location && lastHandover.to.label === holder && <span className="text-[13px] text-ink-3">Handed over {fmtDay(lastHandover.occurredAt)} · {lastHandover.location.verification === "VERIFIED" ? "GPS verified" : lastHandover.location.verification === "SIMULATED" ? "simulated location" : "low GPS accuracy"}</span>}</span>
    : p.custodianType === "AGENT" ? <AgentLocation p={p} />
    : p.custodianType === "VAULT" ? "In the vault" : p.custodianType === "SOLD" ? "Sold" : undefined;

  const panel = (
    <>
      <RecordHeader
        lead={<Thumb src={p.imageUrl} alt={p.name} size={40} className="rounded-[10px]" />}
        title={<span className="num">{p.tagCode}</span>}
        subtitle={p.name}
        primary={
          p.status === "IN_VAULT" ? <Btn variant="primary" icon={SendIcon} onClick={() => setDialog("issue")}>Issue to agent</Btn>
          : p.status === "WITH_AGENT" ? <Btn icon={ArchiveRestoreIcon} onClick={() => setDialog("return")}>Return to vault</Btn>
          : <div className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-sunken px-3 text-[13px] text-ink-2"><PieceStatusDot status={p.status} />{p.memo && <span>· <RecLink href={`/admin/memos/${p.memo.id}`} className="num">{p.memo.number}</RecLink></span>}</div>
        }
      />
      {p.imageUrl && (
        <div className="border-b border-line px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.imageUrl} alt={p.name} className="aspect-[16/9] w-full rounded-xl lg:aspect-[4/3] bg-sunken object-cover ring-1 ring-black/5" />
        </div>
      )}
      <PropertySection title="Sample details">
        <Property icon={TagIcon} label="Tag"><span className="num">{p.tagCode}</span></Property>
        <Property icon={GemIcon} label="Design"><span className="flex min-w-0 flex-col"><RecLink href={`/admin/catalog?design=${d.id}`}>{d.name}</RecLink><span className="text-[13px] text-ink-3">{d.sku} · {d.category}{d.collection ? ` · ${d.collection}` : ""}</span></span></Property>
        <Property icon={BoxesIcon} label="Purity"><span className="text-gold-ink">{PURITY_LABEL[p.purity]}</span></Property>
        <Property icon={ScaleIcon} label="Gross weight"><span className="num">{formatGrams(p.grossWeightMg)}</span></Property>
        <Property icon={ScaleIcon} label="Net weight"><span className="num">{formatGrams(p.netWeightMg)}</span></Property>
        <Property icon={CoinsIcon} label="Value today"><span className="flex flex-col"><span className="num font-medium text-gold-ink">{formatINR(p.valuePaise)}</span>{rate && <span className="text-[13px] text-ink-3">at today&apos;s {PURITY_LABEL[p.purity]} rate {formatRate(rate)}, before GST</span>}</span></Property>
        <Property icon={UserIcon} label="Custodian"><span className="flex items-center gap-2"><HolderLead p={p} />{holderHref ? <RecLink href={holderHref}>{holder}</RecLink> : holder}</span></Property>
        <Property icon={MapPinIcon} label="Location">{location}</Property>
        <Property icon={CircleDotIcon} label="Status"><PieceStatusDot status={p.status} /></Property>
        <Property icon={ScrollTextIcon} label="Memo">{p.memo ? <span className="flex flex-col"><RecLink href={`/admin/memos/${p.memo.id}`} className="num">{p.memo.number}</RecLink><span className="text-[13px] text-ink-3">Due {fmtDay(p.memo.dueDate)} · <DueText days={memoDays} className="text-[13px]" /></span></span> : undefined}</Property>
        <Property icon={ClockIcon} label="Last moved">{p.lastMovedAt ? <span className="num">{fmtDayTime(p.lastMovedAt)}</span> : undefined}</Property>
      </PropertySection>
    </>
  );

  return (
    <RecordLayout back={{ href: "/admin/samples", label: "Samples" }} panel={panel}>
      <RecordTabs tabs={[
        { value: "ledger", label: "Custody ledger", icon: ListOrderedIcon, count: events.length },
        { value: "activity", label: "Activity", icon: ActivityIcon, count: activity.length },
      ]} />
      {tab === "ledger" && (
        <>
          <MainSection title="Highlights">
            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              <Highlight label="Value today" icon={CoinsIcon} tone="gold" sub={rate ? `${formatRate(rate)} · net ${formatGrams(p.netWeightMg)}` : "No rate for this purity"}><span className="num">{formatINR(p.valuePaise)}</span></Highlight>
              <Highlight label="Held by" icon={UserIcon} sub={p.lastMovedAt ? `since ${relTime(p.lastMovedAt)}` : undefined}>{holder}</Highlight>
              <Highlight label="Status" icon={CircleDotIcon} tone={p.status === "OVERDUE" ? "danger" : undefined} sub={p.memo ? `Memo due ${fmtDay(p.memo.dueDate)}` : undefined}><PieceStatusDot status={p.status} /></Highlight>
              <Highlight label="Ledger entries" icon={HashIcon} sub={events.length ? `since ${fmtDay(events[0].occurredAt)}` : undefined}><span className="num">{events.length}</span></Highlight>
            </div>
          </MainSection>
          <MainSection title="Custody ledger" count={events.length}>
            {events.length
              ? <CustodyTimeline events={events} mode="ledger" holders={[{ pieceId: p.id, tagCode: p.tagCode, label: holder }]} />
              : <Empty icon={ListOrderedIcon} title="No custody entries" hint="Pieces get their first entry when they're taken into the vault." />}
          </MainSection>
        </>
      )}
      {tab === "activity" && (
        <MainSection title="Activity">
          <ActivityTimeline items={activity} selfId={p.id} empty={<Empty icon={ActivityIcon} title="No events for this piece yet" hint="Custody changes and the memos it was on show up here." />} />
        </MainSection>
      )}
      <IssueDialog pieces={[p]} open={dialog === "issue"} onOpenChange={(o) => setDialog(o ? "issue" : null)} />
      <ReturnDialog pieces={[p]} open={dialog === "return"} onOpenChange={(o) => setDialog(o ? "return" : null)} />
    </RecordLayout>
  );
}

function SampleInner() {
  const hydrated = useHydrated();
  return hydrated ? <SampleBody /> : <RecordSkeleton />;
}

export default function SampleRecordPage() {
  return <React.Suspense fallback={<RecordSkeleton />}><SampleInner /></React.Suspense>;
}
