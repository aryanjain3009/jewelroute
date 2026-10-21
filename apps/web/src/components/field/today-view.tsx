"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, MapPinOff, Navigation } from "lucide-react";
import { distanceM, formatINRCompact } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/app/chrome";
import type { MapMarker, MapTone } from "@/components/jr/map";
import { cn } from "@/lib/utils";
import { FieldMap } from "./field-map";
import { useToday, errorMessage } from "./queries";
import { ErrorState, MemoChip, SectionTitle } from "./bits";
import { fmtDistance, fmtTime, fmtWeekday, firstName, greeting, mapsDirections, plannedParts, plural } from "./format";
import { BottomBar, PageBar } from "./top-bar";
import { useFieldGeo, type GeoFix, type FieldGeo, geoFailed } from "./use-field-geo";
import type { FieldVisit } from "./types";

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
          <Header name={firstName(d!.user?.name ?? d!.agent.name)} done={d!.progress.completed} total={d!.progress.planned} inProgress={d!.progress.inProgress} />

          {stale && (
            <div role="alert" className="mx-4 mb-4 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3">
              <p className="text-[15px] font-medium text-ink">{stale.shop.name} is still open from {fmtWeekday(stale.plannedDate)}</p>
              <p className="mt-0.5 text-[14px] text-ink-2">Complete that visit before you can check in anywhere today.</p>
              <Button asChild className="mt-3 h-11 w-full text-[15px]"><Link href={`/field/visits/${stale.id}`}>Resume and complete</Link></Button>
            </div>
          )}

          <div className="px-4">
            <div className="relative h-[176px] overflow-hidden rounded-xl border border-line">
              {markers.length > 0 ? (
                <FieldMap markers={markers} me={fix} route={d!.visits.map((v) => v.id)} selectedId={focus?.id} interactive={false} />
              ) : (
                <div className="grid h-full place-items-center bg-sunken text-[13px] text-ink-3">No shops on today’s route</div>
              )}
              <GeoChip geo={geo} />
            </div>
          </div>

          <SectionTitle className="mt-6" aside={d!.visits.length ? plural(d!.visits.length, "stop") : undefined}>Route</SectionTitle>
          {d!.visits.length === 0 ? (
            <div className="mx-4 mt-2 rounded-xl border border-dashed border-line-strong px-5 py-10 text-center">
              <MapPinOff className="mx-auto size-5 text-ink-3" strokeWidth={1.75} />
              <p className="mt-3 text-[15px] font-medium text-ink">No visits assigned for today</p>
              <p className="mt-1 text-[14px] text-ink-2">Your manager assigns shops. Pull to refresh once they have.</p>
            </div>
          ) : (
            <ol className="mt-2 border-y border-line">
              {d!.visits.map((v) => v.id === focus?.id
                ? <FocusRow key={v.id} v={v} distance={dist(fix, v)} innerRef={focusRef} />
                : <VisitRow key={v.id} v={v} distance={dist(fix, v)} />)}
            </ol>
          )}
          {d!.visits.length > 0 && !focus && d!.progress.completed === d!.progress.planned && (
            <p className="px-4 pt-4 text-[14px] text-ink-2">Route complete. Bring unsold samples back to the vault or keep them in your bag for tomorrow.</p>
          )}

          <Link href="/field/profile" className="mx-4 mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-line hover:bg-hover">
            <div className="px-4 py-3">
              <p className="text-[13px] text-ink-2">In your bag</p>
              <p className="mt-0.5 text-[15px] text-ink"><span className="num font-semibold text-gold-ink">{formatINRCompact(d!.bag.valuePaise)}</span> <span className="text-[13px] text-ink-3">{plural(d!.bag.pieceCount, "piece")}</span></p>
            </div>
            <div className="border-l border-line px-4 py-3">
              <p className="text-[13px] text-ink-2">Out on memo</p>
              <p className="mt-0.5 text-[15px] text-ink">
                <span className="num font-semibold">{formatINRCompact(d!.activeMemos.valuePaise)}</span>{" "}
                <span className={cn("text-[13px]", d!.activeMemos.overdueCount ? "text-danger" : "text-ink-3")}>
                  {d!.activeMemos.overdueCount ? `${d!.activeMemos.overdueCount} overdue` : plural(d!.activeMemos.count, "memo")}
                </span>
              </p>
            </div>
          </Link>
        </main>
      )}

      {focus && !focusVisible && (
        <BottomBar aboveTabs>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-ink-3">{isOpen(focus) ? "In visit" : "Next"}</p>
              <p className="truncate text-[15px] font-medium text-ink">{focus.shop.name}</p>
            </div>
            <Button asChild className="h-11 px-5 text-[15px]"><Link href={`/field/visits/${focus.id}`}>{isOpen(focus) ? "Continue visit" : "Open visit"}</Link></Button>
          </div>
        </BottomBar>
      )}
    </>
  );
}

function Header({ name, done, total, inProgress }: { name: string; done: number; total: number; inProgress: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="px-4 pb-4 pt-4">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{greeting()}{name ? `, ${name}` : ""}</h2>
      {total > 0 ? (
        <>
          <p className="mt-1 text-[14px] text-ink-2">
            <span className="num font-medium text-ink">{done} of {total}</span> visits completed{inProgress ? <span className="text-info"> · 1 in progress</span> : null}
          </p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} of ${total} visits completed`}>
            <div className="h-full rounded-full bg-verified transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : <p className="mt-1 text-[14px] text-ink-2">No visits planned today.</p>}
    </div>
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
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-2">
      <span>{v.shop.area}</span>
      {distance !== undefined && !done && <span className="num text-ink-3">{fmtDistance(distance)}</span>}
      {done && v.completedAt && <span className="text-ink-3">Done {fmtTime(v.completedAt)}</span>}
      {v.status === "MISSED" && <span className="text-danger">Missed</span>}
    </span>
  );
}

function FocusRow({ v, distance, innerRef }: { v: FieldVisit; distance?: number; innerRef: React.Ref<HTMLLIElement> }) {
  const open = isOpen(v);
  return (
    <li ref={innerRef} className="relative border-b border-line bg-[#fafafa] last:border-b-0">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-ink" />
      <div className="flex gap-3 px-4 pb-3.5 pt-3">
        <TimeCell v={v} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-ink-2">{open ? "In visit" : "Next"}</span>
            {open && <Chip tone="blue">Checked in {fmtTime(v.checkInAt)}</Chip>}
          </div>
          <p className="truncate text-[16px] font-semibold text-ink">{v.shop.name}</p>
          <Meta v={v} distance={distance} />
          {v.activeMemoCount > 0 && <MemoChip count={v.activeMemoCount} className="mt-2" />}
          <div className="mt-3 flex gap-2">
            <Button asChild className="h-11 flex-1 text-[15px]"><Link href={`/field/visits/${v.id}`}>{open ? "Continue visit" : "Open visit"}</Link></Button>
            <Button asChild variant="outline" className="h-11 w-11 px-0" aria-label={`Directions to ${v.shop.name}`}>
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
      <Link href={`/field/visits/${v.id}`} className="flex min-h-[68px] items-start gap-3 px-4 py-3 transition-colors hover:bg-hover active:bg-sunken">
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

function GeoChip({ geo }: { geo: FieldGeo }) {
  const base = "absolute bottom-2 left-2 rounded-full border border-line bg-paper px-2.5 py-1 text-[12px]";
  if (geo.status === "watching" && geo.fix) return <span className={cn(base, "pointer-events-none text-ink-2")}><span className="mr-1.5 inline-block size-2 rounded-full bg-info align-middle" />You <span className="num">±{Math.round(geo.fix.accuracyM)} m</span></span>;
  if (geoFailed(geo.status)) {
    return (
      <button type="button" onClick={geo.retry} className={cn(base, "font-medium text-danger")}>
        {geo.status === "denied" ? "Location blocked. Distances hidden" : geo.status === "timeout" ? "No GPS fix yet. Tap to retry" : "Location unavailable. Tap to retry"}
      </button>
    );
  }
  return <span className={cn(base, "text-ink-3")}>Finding your location</span>;
}

function TodaySkeleton() {
  return (
    <div className="space-y-3 px-4 pt-4">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-1 w-full" />
      <Skeleton className="h-[176px] w-full rounded-xl" />
      <div className="space-y-px pt-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[68px] w-full" />)}</div>
    </div>
  );
}
