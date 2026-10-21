"use client";
/** Visit record (Attio record page): who, where, when, and the evidence — GPS verdict, fence map,
 *  proof photo with checksum — then what the visit produced (orders, memos, sample moves). */
import { useDocTitle } from "@/lib/title";
import { SIMULATED_LOCATION } from "@/components/app/status";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActivityIcon, CalendarIcon, CameraIcon, CheckIcon, ClipboardListIcon, ClockIcon, CopyIcon, CrosshairIcon, ExternalLinkIcon,
  FileClockIcon, FlaskConicalIcon, GemIcon, LayoutGridIcon, MapPinIcon, MapPinnedIcon, NavigationIcon, ReceiptTextIcon, RulerIcon, ScrollTextIcon,
  RotateCcwIcon, ShieldAlertIcon, ShieldCheckIcon, StoreIcon, Trash2Icon, UserIcon,
} from "lucide-react";
import { formatINRCompact, istDate } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
import type { CustodyEventRow, Memo, Order, Proof, ProofState, VisitReturn } from "@/lib/types";
import { Avatar, Btn, Chip, Empty } from "@/components/app/chrome";
import { Highlight, Highlights, ListCard, ListRow, MainSection, Property, PropertySection, RecordHeader, RecordLayout, RecordTabs, useTab } from "@/components/app/record";
import { ActivityFeed } from "@/components/app/activity-feed";
import { AuditList } from "@/components/app/audit";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JrMap } from "@/components/admin/map-lazy";
import { useVisitRecord, type VRow } from "./data";
import { useUnassign } from "./dialogs";
import {
  MEMO_STATUS, ORDER_STATUS, PROOF, QueryError, RecordSkeleton, StatusChip, StatusDot, VISIT_STATUS, fmtCoord, fmtDist, fmtDuration,
  LinkBtn, istDay, istDayTime, istTime, mediaUrl, wallTime,
} from "./ui";

const VER_COLOR: Record<string, string> = { VERIFIED: "#2c7a54", LOW_ACCURACY: "#b7791f", SIMULATED: "#2f6bf2" };

export function VisitRecord({ id }: { id: string }) {
  const q = useVisitRecord(id);
  useDocTitle(q.data ? `Visit · ${q.data.shop.name}` : undefined);
  const tab = useTab("overview");
  if (q.isLoading) return <RecordSkeleton />;
  if (q.error || !q.data) return <QueryError error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const r = d.row;
  const v = d.visit;
  const shop = d.shop;
  const sim = v.verification === "SIMULATED";
  const agent = d.agent ?? r.agent;
  const proof = d.proofs[0];
  const audit = d.audit ?? [];
  const activity = d.activity ?? [];

  return (
    <RecordLayout back={{ href: "/admin/visits", label: "Visits" }} crumb={`${d.shop.name} · ${istDay(r.plannedDate)}`} panel={<Panel d={d} r={r} />}>
      <RecordTabs tabs={[
        { value: "overview", label: "Overview", icon: LayoutGridIcon },
        { value: "activity", label: "Activity", icon: ActivityIcon, count: activity.length },
        { value: "audit", label: "Audit", icon: FileClockIcon, count: audit.length },
      ]} />
      {tab === "overview" && (
        <div className="pb-10">
          <VerificationBanner r={r} />
          {!v.checkInAt ? (
            <MainSection title="Status">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] border border-line px-4 py-3 text-[14px]">
                <StatusDot map={VISIT_STATUS} value={v.status} className="font-medium" />
                <span className="text-ink-2">{v.status === "PLANNED" ? <>Not started — stop {v.sequence} on {agent.name.split(" ")[0]}&apos;s route{r.plannedTime ? <>, planned {wallTime(r.plannedTime)}</> : null}{r.plannedDate !== istDate() ? <> on {istDay(r.plannedDate)}</> : null}.</> : v.status === "MISSED" ? <>{agent.name} didn&apos;t check in on {istDay(r.plannedDate)}.</> : null}</span>
                <span className="w-full text-[13px] text-ink-3">Check-in, GPS verdict, arrival photo, orders and memos appear here once {agent.name.split(" ")[0]} arrives.</span>
              </div>
            </MainSection>
          ) : (
          <MainSection title="Highlights">
            <Highlights>
              <Highlight label="Verification" icon={r.proofState === "SIMULATED" ? FlaskConicalIcon : ShieldCheckIcon}
                sub={v.verification === "SIMULATED" ? `Not verified · entered ${istTime(v.checkInAt)}` : v.verification ? `Server-checked at ${istTime(v.checkInAt)}` : "Not checked in yet"}>
                {v.verification ? <StatusDot map={PROOF} value={v.verification as ProofState} className="text-[15px] font-medium" /> : <span className="text-ink-3">No value</span>}
              </Highlight>
              <Highlight label="Distance from shop" icon={RulerIcon} sub={sim ? "Simulated location (demo)" : `Fence ${shop.geofenceRadiusM} m${v.checkInAccuracyM != null ? ` · accuracy ±${Math.round(v.checkInAccuracyM)} m` : ""}`}
                tone={!sim && v.checkInDistanceM != null && v.checkInDistanceM > shop.geofenceRadiusM ? "warn" : undefined}>
                {sim ? <span className="text-ink-3">Not measured</span> : fmtDist(v.checkInDistanceM) ?? <span className="text-ink-3">No value</span>}
              </Highlight>
              <Highlight label="Proof" icon={CameraIcon} sub={proof ? `Captured ${istTime(proof.capturedAt ?? proof.uploadedAt)}` : r.proofState === "NOT_STARTED" ? "Visit not started" : "No photo uploaded"}
                tone={r.proofState === "MISSING" ? "danger" : undefined}>
                {r.proofState === "MISSING" ? "Missing" : d.proofs.length ? `${d.proofs.length} photo${d.proofs.length > 1 ? "s" : ""}` : <span className="text-ink-3">No value</span>}
              </Highlight>
              <Highlight label="Order value" icon={ReceiptTextIcon} sub={r.outcome ? `${r.outcome.orderCount} order${r.outcome.orderCount === 1 ? "" : "s"} · excl. rejected` : undefined}>
                {r.outcome?.orderCount ? formatINRCompact(r.outcome.orderValuePaise) : <span className="text-ink-3">None</span>}
              </Highlight>
              <Highlight label="Memo value" icon={ScrollTextIcon} tone={r.outcome?.memoCount ? "gold" : undefined} sub={r.outcome ? `${r.outcome.memoCount} memo${r.outcome.memoCount === 1 ? "" : "s"}${r.outcome.returnedCount ? ` · ${r.outcome.returnedCount} returned` : ""}` : undefined}>
                {r.outcome?.memoCount ? formatINRCompact(r.outcome.memoValuePaise) : <span className="text-ink-3">None</span>}
              </Highlight>
              <Highlight label="Duration" icon={ClockIcon} sub={v.completedAt ? `${istTime(v.checkInAt)} – ${istTime(v.completedAt)}` : v.checkInAt ? "Still open" : undefined}>
                {fmtDuration(r.durationMin) ?? <span className="text-ink-3">No value</span>}
              </Highlight>
            </Highlights>
          </MainSection>
          )}

          <MainSection title="Location">
            <LocationMap d={d} />
          </MainSection>

          {v.checkInAt && <>
          <MainSection title="Visit proof" count={d.proofs.length}>
            {d.proofs.length ? <div className="space-y-3">{d.proofs.map((p, i) => <ProofCard key={p.id} p={p} large={i === 0} simulated={r.proofState === "SIMULATED"} />)}</div>
              : <p className="text-[13px] text-ink-3">No arrival photo. This visit was checked in without one — ask the agent to upload it or treat the visit as unverified.</p>}
          </MainSection>

          <MainSection title="Orders" count={d.orders.length}>
            {d.orders.length ? <ListCard>{d.orders.map((o) => <OrderRow key={o.id} o={o} />)}</ListCard> : <p className="text-[13px] text-ink-3">No orders booked on this visit.</p>}
          </MainSection>
          <MainSection title="Memos" count={d.memosCreated.length}>
            {d.memosCreated.length ? <ListCard>{d.memosCreated.map((m) => <MemoRow key={m.id} m={m} />)}</ListCard> : <p className="text-[13px] text-ink-3">No samples left on memo during this visit.</p>}
          </MainSection>
          </>}
          {(d.returns?.length ?? 0) > 0 && (
            <MainSection title="Samples returned" count={d.returns!.reduce((n, x) => n + x.pieces.length, 0)}>
              <ListCard>{d.returns!.map((x, i) => <ReturnRow key={x.eventId ?? `${x.memoId}-${i}`} r={x} />)}</ListCard>
            </MainSection>
          )}
          {(d.custody?.length ?? 0) > 0 && (
            <MainSection title="Samples moved" count={d.custody!.length}>
              <ListCard>{d.custody!.map((c) => <CustodyRow key={c.id} c={c} />)}</ListCard>
            </MainSection>
          )}
          {(v.summary || d.notes.length > 0) && (
            <MainSection title="Notes" count={d.notes.length + (v.summary ? 1 : 0)}>
              <ListCard>
                {v.summary && <div className="px-3.5 py-2.5 text-[14px]"><div className="mb-0.5 flex items-center gap-2 text-[13px] text-ink-3"><Avatar name={agent.name} size={16} />{agent.name} · visit summary · {istTime(v.completedAt)}</div><p className="text-ink">{v.summary}</p></div>}
                {d.notes.map((n) => <div key={n.id} className="px-3.5 py-2.5 text-[14px]"><div className="mb-0.5 flex items-center gap-2 text-[13px] text-ink-3"><Avatar name={n.author.name} size={16} />{n.author.name} · {istDayTime(n.createdAt)}</div><p className="whitespace-pre-wrap text-ink">{n.body}</p></div>)}
              </ListCard>
            </MainSection>
          )}
        </div>
      )}
      {tab === "activity" && (
        <div className="px-6 py-5">
          <h2 className="mb-4 text-[15px] font-medium text-ink">Activity</h2>
          <ActivityFeed filter={{ visitId: id }} selfId={id} empty={<Empty icon={ActivityIcon} title="No activity yet" hint="Check-in, proof, orders and memos for this visit appear here." />} />
        </div>
      )}
      {tab === "audit" && <AuditList rows={audit} selfId={id} hint="Append-only record of every write on this visit and the orders and memos it created." />}
    </RecordLayout>
  );
}

/* ---------------- left panel ---------------- */
function Panel({ d, r }: { d: NonNullable<ReturnType<typeof useVisitRecord>["data"]>; r: VRow }) {
  const router = useRouter();
  const v = d.visit; const shop = d.shop; const agent = d.agent ?? r.agent;
  const unassign = useUnassign();
  const navHref = `https://www.google.com/maps/search/?api=1&query=${shop.lat},${shop.lng}`;
  const planned = `${istDay(v.plannedDate)}${r.plannedTime ? ` · ${wallTime(r.plannedTime)}` : ""}`;
  return (
    <>
      <RecordHeader
        lead={<span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[#2f6bf2] text-white"><MapPinnedIcon className="size-5" strokeWidth={1.75} /></span>}
        title={shop.name}
        subtitle={<span className="inline-flex items-center gap-2">Visit · {planned}<StatusChip map={VISIT_STATUS} value={v.status} /></span>}
        primary={<LinkBtn href={`/admin/shops/${shop.id}`} icon={StoreIcon}>Open shop record</LinkBtn>}
        actions={<>
          <Tip label="Navigate to shop"><LinkBtn href={navHref} external icon={NavigationIcon} label="Navigate to shop" /></Tip>
          <Tip label="Copy link"><Btn icon={CopyIcon} aria-label="Copy link" onClick={() => { void navigator.clipboard?.writeText(location.href); toast.success("Link copied"); }} /></Tip>
          {v.status === "PLANNED" && <Tip label="Remove from route"><Btn icon={Trash2Icon} variant="danger" aria-label="Remove from route" disabled={unassign.isPending} onClick={() => { if (confirm(`Remove ${shop.name} from ${agent.name}'s route?`)) unassign.mutate(v.id, { onSuccess: () => router.push("/admin/visits") }); }} /></Tip>}
        </>}
      />
      <PropertySection title="Visit details">
        <Property icon={UserIcon} label="Agent"><Link href={`/admin/agents/${agent.id}`} className="inline-flex items-center gap-2 hover:underline"><Avatar name={agent.name} size={20} />{agent.name}</Link></Property>
        <Property icon={StoreIcon} label="Shop"><Link href={`/admin/shops/${shop.id}`} className="inline-flex items-center gap-2 hover:underline"><Avatar name={shop.name} size={20} square />{shop.name}</Link></Property>
        <Property icon={CalendarIcon} label="Planned"><span className="num">{istDay(v.plannedDate)}{r.plannedTime && `, ${wallTime(r.plannedTime)}`}</span><span className="text-ink-3"> · stop {v.sequence}</span></Property>
        {v.checkInAt && <Property icon={ClockIcon} label="Checked in at"><span className="num">{istDayTime(v.checkInAt)}</span></Property>}
        {v.checkInAt && <Property icon={CameraIcon} label="Proof">{r.proofState !== "NOT_STARTED" && <StatusDot map={PROOF} value={r.proofState} />}</Property>}
        {v.completedAt && <Property icon={CheckIcon} label="Completed at"><span className="num">{istDayTime(v.completedAt)}</span></Property>}
      </PropertySection>
      <PropertySection title="Shop" collapseBelowLg>
        <Property icon={MapPinIcon} label="Address"><span className="line-clamp-2">{shop.address}, {shop.area}</span></Property>
        <Property icon={CrosshairIcon} label="Geofence"><span className="num">{shop.geofenceRadiusM} m</span><span className="text-ink-3"> · </span><span className="num text-ink-2">{fmtCoord(shop.lat, shop.lng)}</span></Property>
        <Property icon={ClipboardListIcon} label="Last visit" empty="None yet">{d.shopContext.lastVisit && <Link href={`/admin/visits/${d.shopContext.lastVisit.id}`} className="hover:underline">{istDay(d.shopContext.lastVisit.completedAt)} · {d.shopContext.lastVisit.agentName}</Link>}</Property>
        <Property icon={ScrollTextIcon} label="Open memos" empty="None">{d.shopContext.activeMemos.length > 0 && <span className="num text-gold-ink">{d.shopContext.activeMemos.length} · {formatINRCompact(d.shopContext.activeMemos.reduce((s, m) => s + m.outstandingValuePaise, 0))}</span>}</Property>
      </PropertySection>
    </>
  );
}

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
function CopyText({ text, mono, display }: { text: string; mono?: boolean; display?: string }) {
  const [ok, setOk] = React.useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}
      className={cn("group inline-flex max-w-full items-center gap-1.5 text-left", mono && "font-mono text-[12.5px]")} title="Copy">
      <span className="num truncate">{display ?? text}</span>
      {ok ? <CheckIcon className="size-3.5 shrink-0 text-verified" /> : <CopyIcon className="size-3.5 shrink-0 text-ink-3 opacity-0 group-hover:opacity-100" />}
    </button>
  );
}

/* ---------------- verification ---------------- */
function VerificationBanner({ r }: { r: VRow }) {
  const m: Partial<Record<ProofState, [string, string, React.ComponentType<{ className?: string }>]>> = {
    SIMULATED: ["bg-info-soft text-info", "Simulated check-in. This location was entered in demo mode, not measured by the phone's GPS. Treat it as unverified.", FlaskConicalIcon],
    LOW_ACCURACY: ["bg-warn-soft text-warn", "Low GPS accuracy. The phone reported a wide accuracy circle; the server accepted the check-in using the accuracy slack.", ShieldAlertIcon],
    MISSING: ["bg-danger-soft text-danger", r.completedAt ? "No arrival photo. The visit was completed without proof, so it can't be verified." : `No arrival photo yet. ${r.agent.name.split(" ")[0]} checked in at ${istTime(r.checkInAt)} but hasn't uploaded proof.`, ShieldAlertIcon],
  };
  const x = m[r.proofState];
  if (!x) return null;
  const [cls, text, I] = x;
  return <div className={cn("mx-6 mt-5 flex items-start gap-2.5 rounded-[10px] px-3.5 py-2.5 text-[13.5px]", cls)}><I className="mt-0.5 size-4 shrink-0" />{text}</div>;
}

function LocationMap({ d }: { d: NonNullable<ReturnType<typeof useVisitRecord>["data"]> }) {
  const v = d.visit; const shop = d.shop;
  const sim = v.verification === "SIMULATED";
  const inside = !sim && v.checkInDistanceM != null && v.checkInDistanceM <= shop.geofenceRadiusM;
  const points = [] as { id: string; lat: number; lng: number; color?: string; title?: string }[];
  if (v.checkInLat != null && v.checkInLng != null) points.push({ id: "ci", lat: v.checkInLat, lng: v.checkInLng, color: VER_COLOR[v.verification ?? ""] ?? "#6e6f73", title: sim ? SIMULATED_LOCATION : "Check-in fix" });
  const p = d.proofs[0];
  if (p?.captureLat != null && p.captureLng != null && (p.captureLat !== v.checkInLat || p.captureLng !== v.checkInLng)) points.push({ id: "pr", lat: p.captureLat, lng: p.captureLng, color: "#7a5af5", title: "Photo capture point" });
  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <div className="relative h-[300px]">
        <JrMap initialZoom={17} markers={[{ id: shop.id, lat: shop.lat, lng: shop.lng, tone: "next", label: shop.name, sublabel: shop.address }]} fence={{ lat: shop.lat, lng: shop.lng, radiusM: shop.geofenceRadiusM, inside: !sim && v.checkInDistanceM != null ? inside : undefined }} points={points} />
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-line bg-white/95 px-2 py-1 text-[12px] text-ink-2">
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-ink" />Shop</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full border border-dashed" style={{ borderColor: inside ? "#2c7a54" : "#b08a35" }} />Fence {shop.geofenceRadiusM} m</span>
          {points[0] && <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: points[0].color }} />{sim ? "Simulated fix" : "Check-in"}</span>}
          {points[1] && <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: "#7a5af5" }} />Photo</span>}
        </div>
      </div>
      <dl className="grid grid-cols-2 divide-x divide-line border-t border-line text-[13px] sm:grid-cols-4">
        <MapFact k="Shop centre" v={fmtCoord(shop.lat, shop.lng)} />
        <MapFact k={v.verification === "SIMULATED" ? "Simulated fix" : "Check-in fix"} v={fmtCoord(v.checkInLat, v.checkInLng)} empty={v.checkInAt ? undefined : "Awaiting check-in"} />
        <MapFact k="Distance" v={v.verification === "SIMULATED" ? "Not measured" : v.checkInDistanceM != null ? `${fmtDist(v.checkInDistanceM)} ${inside ? "inside" : "outside"} fence` : undefined} tone={v.verification === "SIMULATED" ? "text-ink-3" : undefined} empty={v.checkInAt ? undefined : "—"} />
        <MapFact k="Verdict" v={v.verification === "SIMULATED" ? "Simulated · not verified" : v.verification ? PROOF[v.verification as ProofState][1] : undefined} tone={v.verification === "SIMULATED" ? "text-info" : v.verification === "LOW_ACCURACY" ? "text-warn" : undefined} empty={v.checkInAt ? undefined : "—"} />
      </dl>
    </div>
  );
}
const MapFact = ({ k, v, tone, empty = "No value" }: { k: string; v?: string; tone?: string; empty?: string }) => (
  <div className="min-w-0 px-3 py-2 [&:nth-child(3)]:border-l-0 sm:[&:nth-child(3)]:border-l">
    <dt className="text-ink-3">{k}</dt><dd className={cn("num truncate text-ink", !v && "text-ink-3", tone)}>{v ?? empty}</dd>
  </div>
);

function ProofCard({ p, large, simulated }: { p: Proof; large: boolean; simulated: boolean }) {
  const [broken, setBroken] = React.useState(false);
  const src = mediaUrl(p.url);
  return (
    <div className={cn("overflow-hidden rounded-[10px] border border-line", large && "grid md:grid-cols-[minmax(0,1fr)_280px]")}>
      <a href={src} target="_blank" rel="noreferrer" className="relative block bg-[#f5f5f5]">
        {broken || !src ? <div className="grid h-56 place-items-center text-[13px] text-ink-3">Photo stored, preview unavailable</div> : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Visit arrival photo" onError={() => setBroken(true)} className={cn("w-full object-cover", large ? "h-[340px]" : "h-40")} />
        )}
        {simulated && <span className="absolute left-2 top-2"><Chip tone="blue">{SIMULATED_LOCATION}</Chip></span>}
      </a>
      <dl className="flex flex-col divide-y divide-line text-[13px] md:border-l md:border-line">
        <ProofFact k="Captured" v={istDayTime(p.capturedAt)} />
        <ProofFact k="Uploaded" v={istDayTime(p.uploadedAt)} />
        <ProofFact k="Capture point" v={fmtCoord(p.captureLat, p.captureLng)} />
        <ProofFact k="From check-in" v={p.distanceM != null ? fmtDist(p.distanceM) : undefined} />
        <ProofFact k="File" v={`${p.contentType.replace("image/", "").toUpperCase()} · ${(p.sizeBytes / 1024).toFixed(0)} KB`} />
        <div className="px-3 py-2">
          <dt className="text-ink-3">SHA-256</dt>
          <dd className="text-ink"><CopyText text={p.checksumSha256} mono display={`${p.checksumSha256.slice(0, 12)}…${p.checksumSha256.slice(-8)}`} /></dd>
        </div>
        <a href={src} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 text-ink-2 hover:bg-hover hover:text-ink"><ExternalLinkIcon className="size-3.5" />Open original</a>
      </dl>
    </div>
  );
}
const ProofFact = ({ k, v }: { k: string; v?: string }) => (
  <div className="flex items-baseline justify-between gap-3 px-3 py-2"><dt className="text-ink-3">{k}</dt><dd className={cn("num truncate text-right", v ? "text-ink" : "text-ink-3")}>{v ?? "No value"}</dd></div>
);

/* ---------------- related rows (shared with Shop + Agent records) ---------------- */
export function OrderRow({ o, showShop }: { o: Order; showShop?: boolean }) {
  const pieces = o.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <ListRow href={`/admin/orders/${o.id}`} className="group h-10 py-0">
      <ReceiptTextIcon className="size-4 shrink-0 text-ink-3" strokeWidth={1.6} />
      <span className="num shrink-0 font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline">{o.number}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-3">{showShop ? `${o.shop.name} · ` : ""}{pieces} piece{pieces === 1 ? "" : "s"} · {o.agent.name} · {istDay(o.createdAt)}</span>
      <span className="hidden w-[170px] shrink-0 items-center gap-1.5 sm:flex"><StatusDot map={ORDER_STATUS} value={o.status} className="text-[13px]" />{o.settledAt && <span className="text-[12.5px] text-ink-3">· settled</span>}</span>
      <span className="num w-20 shrink-0 text-right font-medium text-ink">{formatINRCompact(o.totalPaise)}</span>
    </ListRow>
  );
}
export function MemoRow({ m, showShop }: { m: Memo; showShop?: boolean }) {
  const out = m.items.filter((i) => i.status === "OUT").length;
  const due = m.status === "RETURNED" || m.status === "CONVERTED_TO_ORDER" ? `closed` : m.daysToDue < 0 ? `${-m.daysToDue} d overdue` : m.daysToDue === 0 ? "due today" : `due ${istDay(m.dueDate)}`;
  return (
    <ListRow href={`/admin/memos/${m.id}`} className="group h-10 py-0">
      <ScrollTextIcon className="size-4 shrink-0 text-gold" strokeWidth={1.6} />
      <span className="num shrink-0 font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline">{m.number}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-3">{showShop ? `${m.shop.name} · ` : ""}{out} of {m.items.length} out · {due}</span>
      <span className="hidden w-[150px] shrink-0 sm:block"><StatusDot map={MEMO_STATUS} value={m.displayStatus} className="text-[13px]" /></span>
      <span className="num w-20 shrink-0 text-right font-medium text-gold-ink">{formatINRCompact(m.outstandingValuePaise || m.totalValuePaise)}</span>
    </ListRow>
  );
}
/** One return action made during this visit: the memo it closed out and the pieces that came back. */
export function ReturnRow({ r }: { r: VisitReturn }) {
  return (
    <ListRow className="flex-wrap gap-y-1">
      <RotateCcwIcon className="size-4 shrink-0 text-gold" strokeWidth={1.6} />
      <Link href={`/admin/memos/${r.memoId}`} className="num shrink-0 font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 hover:underline">{r.memoNumber}</Link>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
        {r.pieces.length} piece{r.pieces.length === 1 ? "" : "s"} back in the bag ·{" "}
        {r.pieces.map((p, i) => <React.Fragment key={p.id}>{i > 0 && ", "}<Link href={`/admin/samples/${p.id}`} className="num text-ink hover:underline" title={p.name}>{p.tagCode}</Link></React.Fragment>)}
      </span>
      <span className="w-16 shrink-0 text-right text-[13px] text-ink-3">{istTime(r.at)}</span>
    </ListRow>
  );
}
const REASON: Record<string, string> = { INTAKE: "Taken into stock", ISSUE_TO_AGENT: "Issued", MEMO_HANDOVER: "Left on memo", MEMO_RETURN: "Returned", RETURN_TO_VAULT: "Back to vault", CONVERTED_TO_SALE: "Sold", SALE_REJECTED: "Sale rejected", ADJUSTMENT: "Adjusted" };
export function CustodyRow({ c }: { c: CustodyEventRow }) {
  return (
    <ListRow href={`/admin/samples/${c.pieceId}`} className="group h-10 py-0">
      <GemIcon className="size-4 shrink-0 text-gold" strokeWidth={1.6} />
      <span className="num shrink-0 font-medium text-ink">{c.tagCode}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2"><span className="text-ink-3">{c.pieceName} · </span>{c.from.label} → {c.to.label}</span>
      <span className="hidden shrink-0 text-[13px] text-ink-2 sm:block">{REASON[c.reason] ?? c.reason}</span>
      <span className="w-16 shrink-0 text-right text-[13px] text-ink-3">{istTime(c.occurredAt)}</span>
    </ListRow>
  );
}


