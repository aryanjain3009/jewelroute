"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, CheckCircle2, ChevronRight, Clock3, MapPinOff, Navigation, TriangleAlert } from "lucide-react";
import { distanceM, formatINR, formatINRCompact } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/app/chrome";
import type { MapMarker, MapTone } from "@/components/jr/map";
import { cn } from "@/lib/utils";
import { FieldMap } from "./field-map";
import { useToday, errorMessage } from "./queries";
import { ErrorState, FieldEmpty, MemoChip, Notice, PRESS_BTN, PRESS_ROW, SectionTitle } from "./bits";
import { fmtDistance, fmtPlanned, fmtTime, fmtWeekday, firstName, greeting, mapsDirections, plannedParts, plural } from "./format";
import { BottomBar, PageBar } from "./top-bar";
import { useFieldGeo, type GeoFix, type FieldGeo, geoFailed } from "./use-field-geo";
import type { FieldVisit, TodayResponse } from "./types";

const isOpen = (v: FieldVisit) => v.status === "CHECKED_IN" || v.status === "ACTIVE";
const toneFor = (v: FieldVisit, focusId?: string): MapTone => {
  if (v.status === "COMPLETED") return "done";
  if (isOpen(v)) return "active";
  if (v.status === "MISSED") return "alert";
  if (v.status === "CANCELLED") return "muted";
  return v.id === focusId ? "next" : "planned";
};
const dist = (fix: GeoFix | null, v: FieldVisit) => (fix ? distanceM(fix.lat, fix.lng, v.shop.lat, v.shop.lng) : undefined);

export function TodayView() {
  const router = useRouter();
  const q = useToday();
  const geo = useFieldGeo(true);
  const fix = geo.fix;
  const d = q.data;
  // The visit to act on: an open one first, else the server's next planned stop.
  const focus = d ? d.openVisit ?? d.visits.find(isOpen) ?? d.visits.find((v) => v.id === d.nextVisitId) : undefined;
  // A visit left open on an earlier day blocks every check-in today; it must be resolved first.
  const stale = d?.openVisit && d.openVisit.plannedDate !== d.date ? d.openVisit : undefined;

  const markers: MapMarker[] = useMemo(() => (d?.visits ?? []).map((v) => ({
    id: v.id, lat: v.shop.lat, lng: v.shop.lng, label: v.shop.name, sublabel: v.shop.area,
    tone: toneFor(v, focus?.id), badge: v.sequence, onClick: () => router.push(`/field/visits/${v.id}`),
  })), [d, focus?.id, router]);

  // Sticky "Open visit" appears only when the focus row's own button has scrolled away.
  const focusRef = useRef<HTMLLIElement>(null);
  const [focusVisible, setFocusVisible] = useState(true);
  useEffect(() => {
    const el = focusRef.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setFocusVisible(e.isIntersecting), { rootMargin: "-48px 0px -64px 0px", threshold: 0.6 });
    io.observe(el); return () => io.disconnect();
  }, [focus?.id, q.isSuccess]);

  return (
    <>
      <PageBar title="Today" right={<span className="text-[13px] text-ink-3">{fmtWeekday(d?.date ?? new Date())}</span>} />
      {q.isPending ? <TodaySkeleton /> : q.isError ? (
        <ErrorState title="Couldn't load today's route" message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <main className="pb-6">
          <Header d={d!} name={firstName(d!.user?.name ?? d!.agent.name)} />
          <Carrying d={d!} />

          {stale && (
            <Notice tone="warn" icon={TriangleAlert} role="alert" className="mx-4 mb-4"
              title={<>{stale.shop.name} is still open from {fmtWeekday(stale.plannedDate)}</>}
              action={<Button asChild className={cn("h-11 w-full text-[15px]", PRESS_BTN)}><Link href={`/field/visits/${stale.id}`}>Resume and complete</Link></Button>}>
              Complete that visit before you can check in anywhere today.
            </Notice>
          )}

          {d!.visits.length > 0 && (
            <div className="px-4">
              <div className="relative h-[168px] overflow-hidden rounded-xl border border-line bg-sunken">
                <FieldMap markers={markers} me={fix} route={d!.visits.map((v) => v.id)} interactive={false} markerStyle="numbered" selectedId={focus?.id} />
                <GeoChip geo={geo} />
              </div>
            </div>
          )}

          {d!.visits.length === 0 ? (
            <FieldEmpty icon={MapPinOff} className="mx-4 mt-2 rounded-xl border border-line py-12" title="No visits assigned for today"
              hint="Your manager assigns shops. They appear here on their own as soon as they're assigned."
              action={<Button asChild variant="outline" className={cn("h-11 px-4 text-[15px]", PRESS_BTN)}><Link href="/field/visits?scope=upcoming"><CalendarClock />See upcoming visits</Link></Button>} />
          ) : (
            <>
              <SectionTitle className="mt-6" aside={plural(d!.visits.length, "stop")}>Route</SectionTitle>
              {!focus && <RouteDone d={d!} />}
              <ol className="mt-2 border-y border-line">
                {d!.visits.map((v) => v.id === focus?.id
                  ? <FocusRow key={v.id} v={v} distance={dist(fix, v)} innerRef={focusRef} />
                  : <VisitRow key={v.id} v={v} distance={dist(fix, v)} />)}
              </ol>
            </>
          )}

        </main>
      )}

      {focus && !focusVisible && (
        <BottomBar aboveTabs enter>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-ink-3">{isOpen(focus) ? `In visit since ${fmtTime(focus.checkInAt)}` : `Next stop${focus.plannedTime ? `, ${fmtPlanned(focus.plannedTime)}` : ""}`}</p>
              <p className="truncate text-[15px] font-medium text-ink">{focus.shop.name}</p>
            </div>
            <Button asChild className={cn("h-11 px-5 text-[15px]", PRESS_BTN)}><Link href={`/field/visits/${focus.id}`}>{isOpen(focus) ? "Continue visit" : "Open visit"}</Link></Button>
          </div>
        </BottomBar>
      )}
    </>
  );
}

const SEG: Record<FieldVisit["status"], string> = {
  COMPLETED: "bg-verified", CHECKED_IN: "bg-info", ACTIVE: "bg-info", MISSED: "bg-danger", CANCELLED: "bg-line", PLANNED: "bg-line-strong",
};

function Header({ d, name }: { d: TodayResponse; name: string }) {
  const { completed: done, planned: total, inProgress } = d.progress;
  const missed = d.visits.filter((v) => v.status === "MISSED").length;
  return (
    <div className="px-4 pb-4 pt-4">
      <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{greeting()}{name ? `, ${name}` : ""}</h2>
      {total > 0 ? (
        <>
          <p className="mt-1 flex flex-wrap gap-x-3 text-[14px] text-ink-2">
            <span><span className="num font-medium text-ink">{done} of {total}</span> visits completed</span>
            {inProgress > 0 && <span className="text-info">{inProgress} in progress</span>}
            {missed > 0 && <span className="text-danger">{missed} missed</span>}
          </p>
          {/* One segment per stop, in route order, coloured by the status the server holds. */}
          <div className="mt-3 flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} of ${total} visits completed`}>
            {d.visits.map((v) => <span key={v.id} className={cn("h-1 flex-1 rounded-full transition-colors duration-300", SEG[v.status])} />)}
          </div>
        </>
      ) : <p className="mt-1 text-[14px] text-ink-2">No visits planned today.</p>}
    </div>
  );
}

function RouteDone({ d }: { d: TodayResponse }) {
  const all = d.progress.completed === d.progress.planned;
  return all ? (
    <Notice tone="ok" icon={CheckCircle2} className="mx-4 mt-2" title="Route complete"
      action={<Button asChild variant="outline" className={cn("h-10 bg-paper px-3.5 text-[14px]", PRESS_BTN)}><Link href="/field/profile">Check your bag</Link></Button>}>
      All {plural(d.progress.planned, "visit")} done. Bring unsold samples back to the vault, or keep them in your bag for tomorrow.
    </Notice>
  ) : (
    <Notice tone="neutral" icon={Clock3} className="mx-4 mt-2" title="No more stops planned today">
      {d.progress.completed} of {d.progress.planned} visits completed. Your manager can add a shop to your route.
    </Notice>
  );
}

function TimeCell({ v, muted }: { v: FieldVisit; muted?: boolean }) {
  const p = plannedParts(v.plannedTime);
  return (
    <span className={cn("w-12 shrink-0 pt-px leading-tight", muted ? "text-ink-3" : "text-ink")}>
      {p ? <><span className="num block text-[15px] font-medium">{p.t}</span><span className="block text-[12px] text-ink-3">{p.ap}</span></>
        : <span className="num block text-[15px] font-medium">#{v.sequence}</span>}
    </span>
  );
}

function Meta({ v, distance }: { v: FieldVisit; distance?: number }) {
  const done = v.status === "COMPLETED";
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-x-2.5 text-[13px] text-ink-2">
      <span className="truncate">{v.shop.area}</span>
      {distance !== undefined && !done && v.status !== "CANCELLED" && (distance <= v.shop.geofenceRadiusM
        ? <span className="shrink-0 font-medium text-verified">You’re here</span>
        : <span className="num shrink-0 text-ink-3">{fmtDistance(distance)} away</span>)}
      {done && v.completedAt && <span className="shrink-0 text-ink-3">Done <span className="num">{fmtTime(v.completedAt)}</span></span>}
      {v.status === "MISSED" && <span className="shrink-0 text-danger">Missed</span>}
      {v.status === "CANCELLED" && <span className="shrink-0 text-ink-3">Cancelled</span>}
    </span>
  );
}

function FocusRow({ v, distance, innerRef }: { v: FieldVisit; distance?: number; innerRef: React.Ref<HTMLLIElement> }) {
  const open = isOpen(v);
  return (
    <li ref={innerRef} className="relative border-b border-line bg-[#fafafa] last:border-b-0">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-ink" />
      <div className="flex gap-3 px-4 pb-4 pt-3.5">
        <TimeCell v={v} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {open
              ? <Chip tone="blue"><span className="size-1.5 rounded-full bg-current" aria-hidden />In visit since <span className="num">{fmtTime(v.checkInAt)}</span></Chip>
              : <span className="text-[12px] font-semibold text-ink-2">Next stop</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">{v.shop.name}</p>
          <Meta v={v} distance={distance} />
          {v.activeMemoCount > 0 && <MemoChip count={v.activeMemoCount} valuePaise={v.activeMemoValuePaise} className="mt-2" />}
          <div className="mt-3.5 flex gap-2">
            <Button asChild className={cn("h-11 flex-1 text-[15px]", PRESS_BTN)}><Link href={`/field/visits/${v.id}`}>{open ? "Continue visit" : "Open visit"}</Link></Button>
            <Button asChild variant="outline" className={cn("size-11 bg-paper px-0", PRESS_BTN)} aria-label={`Directions to ${v.shop.name}`}>
              <a href={mapsDirections(v.shop.lat, v.shop.lng)} target="_blank" rel="noreferrer"><Navigation className="size-[18px]" /></a>
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

function VisitRow({ v, distance }: { v: FieldVisit; distance?: number }) {
  const done = v.status === "COMPLETED";
  const muted = done || v.status === "CANCELLED" || v.status === "MISSED";
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={`/field/visits/${v.id}`} className={cn("flex min-h-[68px] items-start gap-3 px-4 py-3", PRESS_ROW)}>
        <TimeCell v={v} muted={muted} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[15px] font-medium", muted ? "text-ink-2" : "text-ink")}>{v.shop.name}</p>
          <Meta v={v} distance={distance} />
          {v.activeMemoCount > 0 && !muted && <MemoChip count={v.activeMemoCount} className="mt-1.5" />}
        </div>
        {done
          ? <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-verified-soft text-verified" aria-label="Completed"><Check className="size-3.5" strokeWidth={2.5} /></span>
          : <ChevronRight className="mt-1.5 size-4 shrink-0 text-ink-3" />}
      </Link>
    </li>
  );
}

/** What Rahul is responsible for right now, in one line: pieces in his bag and pieces on memo (both are
 *  custody, so both values are gold), with overdue memos called out. */
function Carrying({ d }: { d: TodayResponse }) {
  const overdue = d.activeMemos.overdueCount;
  return (
    <section aria-label="Custody" className="mx-4 mb-4 grid grid-cols-2 overflow-hidden rounded-xl border border-line">
      <Link href="/field/profile" className={cn("min-w-0 px-3.5 py-2.5", PRESS_ROW)} title={formatINR(d.bag.valuePaise)}>
        <p className="text-[12px] text-ink-2">In your bag</p>
        <p className="mt-0.5 flex items-baseline gap-2"><span className="num text-[16px] font-semibold text-gold-ink">{formatINRCompact(d.bag.valuePaise)}</span><span className="text-[12px] text-ink-3">{plural(d.bag.pieceCount, "piece")}</span></p>
      </Link>
      <Link href="/field/profile#memos" className={cn("min-w-0 border-l border-line px-3.5 py-2.5", PRESS_ROW)} title={formatINR(d.activeMemos.valuePaise)}>
        <p className="text-[12px] text-ink-2">On memo</p>
        <p className="mt-0.5 flex items-baseline gap-2">
          {d.activeMemos.count ? <span className="num text-[16px] font-semibold text-gold-ink">{formatINRCompact(d.activeMemos.valuePaise)}</span> : <span className="text-[16px] text-ink-3">None</span>}
          <span className={cn("truncate text-[12px]", overdue ? "font-medium text-danger" : "text-ink-3")}>{overdue ? `${overdue} overdue` : plural(d.activeMemos.count, "memo")}</span>
        </p>
      </Link>
    </section>
  );
}

function GeoChip({ geo }: { geo: FieldGeo }) {
  const base = "absolute bottom-2 left-2 inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 text-[12px] shadow-float";
  if (geo.status === "watching" && geo.fix) return <span className={cn(base, "pointer-events-none text-ink-2")}><span className="size-2 rounded-full bg-info" />You <span className="num">±{Math.round(geo.fix.accuracyM)} m</span></span>;
  if (geoFailed(geo.status)) {
    return (
      <button type="button" onClick={geo.retry} className={cn(base, "font-medium text-danger transition-opacity active:opacity-60")}>
        <span className="size-2 rounded-full bg-danger" />
        {geo.status === "denied" ? "Location blocked, distances hidden" : geo.status === "timeout" ? "No GPS fix yet, tap to retry" : "Location unavailable, tap to retry"}
      </button>
    );
  }
  return <span className={cn(base, "text-ink-3")}><span className="size-2 animate-pulse rounded-full bg-ink-3" />Finding your location</span>;
}

function TodaySkeleton() {
  return (
    <div className="pt-4" aria-busy>
      <div className="space-y-2 px-4"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-40" /></div>
      <div className="mt-3 flex gap-1 px-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-1 flex-1" />)}</div>
      <div className="mt-5 px-4"><Skeleton className="h-[168px] w-full rounded-xl" /></div>
      <div className="mt-6 px-4"><Skeleton className="h-3.5 w-14" /></div>
      <div className="mt-3 divide-y divide-line border-y border-line">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 px-4 py-3.5">
            <div className="w-12 space-y-1.5"><Skeleton className="h-4 w-10" /><Skeleton className="h-3 w-6" /></div>
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-44" /><Skeleton className="h-3 w-28" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
