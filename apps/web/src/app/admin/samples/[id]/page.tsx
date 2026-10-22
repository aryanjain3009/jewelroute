"use client";
/** Sample record — financial-grade asset tracking for ONE physical piece. Answers in seconds:
 *  where is it now, how did it get there, who acknowledged receiving it. Left: photo + attributes.
 *  Main: a one-line answer from the API's state, the custody journey (Vault → Agent → Retailer → …),
 *  and the immutable ledger where every transition links actor, time, visit, memo, retailer
 *  acknowledgement, proof photo and event id. Nothing is inferred — every word comes from the ledger. */
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ActivityIcon, ArchiveRestoreIcon, BoxesIcon, ChevronRightIcon, CircleDotIcon, ClockIcon, CoinsIcon, GemIcon, ListOrderedIcon,
  MapPinIcon, ReceiptTextIcon, ScaleIcon, ScrollTextIcon, SendIcon,  TagIcon, UserIcon, CalendarClockIcon,
} from "lucide-react";
import { formatGrams, formatINR, formatINRCompact, formatRate, istDate, PURITY_LABEL } from "@jewelroute/shared";
import type { CustodyEventRow, CustodyParty, PieceRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Btn, Empty } from "@/components/app/chrome";
import { MainSection, Property, PropertySection, RecordHeader, RecordLayout, RecordTabs, useTab } from "@/components/app/record";
import { ActivityFeed } from "@/components/app/activity-feed";
import { useMemoRecord, usePieceRecord } from "@/components/admin-v2/sales/data";
import { CustodyTimeline, PartyLead, partyHref } from "@/components/admin-v2/sales/custody-timeline";
import { WhereNow, dueDay, ROLE } from "@/components/admin-v2/sales/where-now";
import { IssueDialog, ReturnDialog } from "@/components/admin-v2/sales/piece-actions";
import { DueText, ErrorState, fmtDay, fmtDayTime, holderLabel, PieceStatusDot, RecLink, RecordSkeleton, Thumb, useHydrated } from "@/components/admin-v2/sales/ui";
import { useDocTitle } from "@/lib/title";
import { LinkBtn } from "@/components/admin-v2/field/ui";
import { PIECE_STATUS, StatusChip } from "@/components/app/status";

const sorted = (ev: CustodyEventRow[]) => [...ev].sort((a, b) => a.seq - b.seq);

/* ---------------- custody journey: the path this piece actually took ---------------- */
interface Stage { party: CustodyParty; since: string; via?: CustodyEventRow }
function stagesOf(events: CustodyEventRow[]): Stage[] {
  const ev = sorted(events);
  if (!ev.length) return [];
  const out: Stage[] = [];
  if (ev[0].reason !== "INTAKE") out.push({ party: ev[0].from, since: ev[0].occurredAt });
  for (const e of ev) {
    const prev = out[out.length - 1];
    if (prev && prev.party.type === e.to.type && prev.party.label === e.to.label) continue;
    out.push({ party: e.to, since: e.occurredAt, via: e });
  }
  return out;
}
const NEXT: Record<string, string> = { VAULT: "Issue to an agent", AGENT: "Retailer on memo, or back to vault", SHOP: "Back to agent, or converted to order" };

function Journey({ events, current }: { events: CustodyEventRow[]; current: PieceRow }) {
  const stages = stagesOf(events);
  if (!stages.length) return null;
  const next = NEXT[current.custodianType];
  return (
    <div className="overflow-x-auto px-6 pb-1 pt-5 scrollbar-none">
      <ol className="flex min-w-max items-start">
        {stages.map((s, i) => {
          const isNow = i === stages.length - 1;
          const href = partyHref(s.party);
          const label = s.party.type === "SOLD" ? (s.via?.order?.number ?? "Sold") : s.party.label;
          return (
            <li key={i} className="flex items-start">
              <div className={cn("flex w-[148px] flex-col gap-1.5 rounded-[10px] border px-3 py-2.5", isNow ? "border-gold/50 bg-gold-soft/40" : "border-line bg-white")}>
                <span className="flex items-center gap-2">
                  <PartyLead p={s.party} size={20} />
                  <span className="truncate text-[12px] text-ink-3">{ROLE[s.party.type] ?? s.party.type}</span>
                </span>
                <span className="truncate text-[14px] font-medium text-ink">
                  {s.party.type === "SOLD" && s.via?.order ? <Link href={`/admin/orders/${s.via.order.id}`} className="num hover:underline">{label}</Link> : href ? <Link href={href} className="hover:underline">{label}</Link> : label}
                </span>
                <span className="num text-[12px] text-ink-3">{isNow ? "Now · since " : ""}{fmtDay(s.since)}</span>
              </div>
              {(i < stages.length - 1 || next) && <ChevronRightIcon className="mx-1 mt-7 size-4 shrink-0 text-ink-3" />}
            </li>
          );
        })}
        {next && (
          <li className="flex w-[148px] flex-col justify-center gap-1 rounded-[10px] border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-ink-3" style={{ minHeight: 82 }}>
            <span>Next</span>
            <span className="text-ink-2">{next}</span>
          </li>
        )}
      </ol>
    </div>
  );
}

function SampleBody() {
  const { id } = useParams<{ id: string }>();
  const rec = usePieceRecord(id);
  useDocTitle(rec.data ? `${rec.data.piece.tagCode} · ${rec.data.design.name}` : undefined);
  const memoRec = useMemoRecord(rec.data?.piece.memo?.id);
  const tab = useTab("custody");
  const [dialog, setDialog] = React.useState<"issue" | "return" | null>(null);
  const today = istDate();

  if (rec.error) return <ErrorState error={rec.error} retry={() => rec.refetch()} className="h-full" />;
  if (!rec.data) return <RecordSkeleton />;
  const { piece: p, design: d, events } = rec.data;
  const lastOrder = [...events].reverse().find((e) => e.order)?.order;
  const holder = holderLabel(p);
  const holderHref = p.custodianType === "AGENT" && p.custodian.agentId ? `/admin/agents/${p.custodian.agentId}` : p.custodianType === "SHOP" && p.custodian.shopId ? `/admin/shops/${p.custodian.shopId}` : undefined;
  const rate = d.price && d.price.purity === p.purity ? d.price.ratePaisePerGram : undefined;
  const memoDays = p.memo ? Math.round((+new Date(`${p.memo.dueDate}T00:00:00+05:30`) - +new Date(`${today}T00:00:00+05:30`)) / 86_400_000) : 0;
  const m = memoRec.data?.memo;
  const area = m?.shop.area;

  const location: React.ReactNode =
    p.custodianType === "SHOP" ? <>{holder}{area ? `, ${area}` : ""}</>
    : p.custodianType === "AGENT" ? (p.location ? (p.location.visitId ? <RecLink href={`/admin/visits/${p.location.visitId}`}>{p.location.label}</RecLink> : p.location.label) : undefined)
    : p.custodianType === "VAULT" ? "Vault" : p.custodianType === "SOLD" ? "Sold — with the retailer" : undefined;

  const panel = (
    <>
      <RecordHeader
        lead={<Thumb src={p.imageUrl} alt={p.name} size={48} className="rounded-[10px]" />}
        title={<span className="flex min-w-0 items-center gap-2"><span className="num truncate">{p.tagCode}</span><StatusChip map={PIECE_STATUS} value={p.status} /></span>}
        subtitle={<span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{p.name}</span><span className="text-ink-3">·</span><span className="shrink-0 font-medium text-gold-ink">{PURITY_LABEL[p.purity]}</span><span className="text-ink-3">·</span><span className="num shrink-0 font-medium text-gold-ink">{formatINRCompact(p.valuePaise)}</span></span>}
        primary={
          p.status === "IN_VAULT" ? <Btn variant="primary" icon={SendIcon} onClick={() => setDialog("issue")}>Issue to agent</Btn>
          : p.status === "WITH_AGENT" ? <Btn icon={ArchiveRestoreIcon} onClick={() => setDialog("return")}>Return to vault</Btn>
          : p.memo ? <LinkBtn href={`/admin/memos/${p.memo.id}`} icon={ScrollTextIcon}>Open {p.memo.number}</LinkBtn>
          : lastOrder ? <LinkBtn href={`/admin/orders/${lastOrder.id}`} icon={ReceiptTextIcon}>Open {lastOrder.number}</LinkBtn>
          : <div className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-ink-2"><PieceStatusDot status={p.status} /></div>
        }
      />
      {p.imageUrl && (
        // Below lg the 48 px header thumbnail carries the photo, so "where is it now" stays above the fold.
        <div className="hidden border-b border-line px-5 py-4 lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.imageUrl} alt={p.name} className="aspect-[16/10] w-full rounded-xl bg-sunken object-cover ring-1 ring-black/5" />
        </div>
      )}
      <PropertySection title="Piece" collapseBelowLg>
        <Property icon={TagIcon} label="Tag"><span className="num">{p.tagCode}</span></Property>
        <Property icon={GemIcon} label="Design"><span className="flex min-w-0 flex-col"><RecLink href={`/admin/catalog?design=${d.id}`}>{d.name}</RecLink><span className="text-[13px] text-ink-3">{d.sku} · {d.category}{d.collection ? ` · ${d.collection}` : ""}</span></span></Property>
        <Property icon={BoxesIcon} label="Purity"><span className="text-gold-ink">{PURITY_LABEL[p.purity]}</span></Property>
        <Property icon={ScaleIcon} label="Weight"><span className="num">{formatGrams(p.grossWeightMg)} gross<span className="text-ink-3"> · </span>{formatGrams(p.netWeightMg)} net</span></Property>
        <Property icon={CoinsIcon} label="Value today"><span className="flex flex-col"><span className="num font-medium text-gold-ink">{formatINR(p.valuePaise)}</span>{rate && <span className="text-[13px] text-ink-3">{PURITY_LABEL[p.purity]} {formatRate(rate)} today, before GST</span>}</span></Property>
      </PropertySection>
      <PropertySection title="Custody" defaultOpen={false}>
        <Property icon={UserIcon} label="Custodian"><span className="flex items-center gap-2"><PartyLead p={{ type: p.custodianType, id: p.custodian.agentId ?? p.custodian.shopId, label: holder }} size={20} />{holderHref ? <RecLink href={holderHref}>{holder}</RecLink> : holder}</span></Property>
        <Property icon={MapPinIcon} label="Location">{location}</Property>
        <Property icon={CircleDotIcon} label="Status"><PieceStatusDot status={p.status} /></Property>
        <Property icon={ScrollTextIcon} label="Memo">{p.memo ? <span className="flex flex-col"><RecLink href={`/admin/memos/${p.memo.id}`} className="num">{p.memo.number}</RecLink>{m && <span className="text-[13px] text-ink-3">{m.ackStatus === "ACKNOWLEDGED" ? `Acknowledged ${m.ackMethod === "OTP" ? "by code" : "via QR"}${m.ackAt ? ` · ${fmtDayTime(m.ackAt)}` : ""}` : "Not acknowledged yet"}</span>}</span> : undefined}</Property>
        <Property icon={CalendarClockIcon} label="Due date">{p.memo ? <span className="flex flex-col"><span className="num">{dueDay(p.memo.dueDate)}</span><DueText days={memoDays} className="text-[13px]" /></span> : undefined}</Property>
        <Property icon={ClockIcon} label="Last moved">{p.lastMovedAt ? <span className="num">{fmtDayTime(p.lastMovedAt)}</span> : undefined}</Property>
      </PropertySection>
    </>
  );

  return (
    <RecordLayout back={{ href: "/admin/samples", label: "Samples" }} crumb={<span className="num">{p.tagCode}</span>} panel={panel}>
      <RecordTabs tabs={[
        { value: "custody", label: "Custody", icon: ListOrderedIcon, count: events.length },
        { value: "activity", label: "Activity", icon: ActivityIcon },
      ]} />
      {tab === "custody" && (
        <>
          <WhereNow p={p} events={events} memo={memoRec.data} />
          <Journey events={events} current={p} />
          <MainSection title="Custody ledger" count={events.length}>
            {events.length
              ? <CustodyTimeline events={events} mode="ledger" holders={[{ pieceId: p.id, tagCode: p.tagCode, label: holder }]} />
              : <Empty icon={ListOrderedIcon} title="No custody entries" hint="Pieces get their first entry when they're taken into the vault." />}
          </MainSection>
        </>
      )}
      {tab === "activity" && (
        <MainSection title="Activity">
          <ActivityFeed filter={{ pieceId: p.id }} selfId={p.id} empty={<Empty icon={ActivityIcon} title="No events for this piece yet" hint="Custody changes and the memos it was on show up here." />} />
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
