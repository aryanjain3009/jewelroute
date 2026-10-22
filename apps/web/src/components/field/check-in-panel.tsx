"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, LocateFixed, LocateOff, Navigation, Radar, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { distanceM, geofenceDecision } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/session";
import { qk, useSync } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { FieldMap } from "./field-map";
import { errorMessage } from "./queries";
import { fmtDistance, fmtWeekday, mapsDirections } from "./format";
import { opKey, useGuard } from "./guard";
import { BottomBar } from "./top-bar";
import { geoFailed, useFieldGeo, type FieldGeo } from "./use-field-geo";
import { Notice, PRESS, PRESS_BTN } from "./bits";
import type { GeofenceCheck, VisitDetail } from "./types";

/** Before check-in: map with the fence, live distance, the server's geofence verdict, and `Check in`. */
export function CheckInStage({ data }: { data: VisitDetail }) {
  const { shop, visit } = data;
  const router = useRouter();
  const sync = useSync();
  const demo = !!useMe().data?.tenant.demoMode;
  const geo = useFieldGeo(true);
  const fixRef = useRef(geo.fix); fixRef.current = geo.fix;
  const [run, busy] = useGuard();

  const fence = useQuery({
    queryKey: qk.geofence(visit.id),
    queryFn: async () => {
      const f = fixRef.current!;
      const r = await api<GeofenceCheck>(`/visits/${visit.id}/geofence-check`, { body: { lat: f.lat, lng: f.lng, accuracyM: Math.round(f.accuracyM) } });
      return { ...r, forLat: f.lat, forLng: f.lng };
    },
    enabled: !!geo.fix,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: 1,
  });

  // Re-ask the server as soon as the agent has moved noticeably instead of waiting for the next tick.
  const refetch = fence.refetch;
  useEffect(() => {
    const f = geo.fix; const d = fence.data;
    if (!f || !d || distanceM(f.lat, f.lng, d.forLat, d.forLng) < 15) return;
    const t = setTimeout(() => refetch(), 600);
    return () => clearTimeout(t);
  }, [geo.fix, fence.data, refetch]);

  const local = geo.fix ? distanceM(geo.fix.lat, geo.fix.lng, shop.lat, shop.lng) : undefined;
  const server = fence.data;
  // Only the server decides "inside", and only for (roughly) the position we're showing.
  const fresh = !!server && !!geo.fix && distanceM(geo.fix.lat, geo.fix.lng, server.forLat, server.forLng) < 25;
  const inside = fresh && !!server?.inside;
  const radius = server?.radiusM ?? shop.geofenceRadiusM;
  const shown = local ?? server?.distanceM;
  const locallyInside = local !== undefined && geo.fix ? geofenceDecision(local, radius, geo.fix.accuracyM).inside : false;

  const checkIn = (mode: "real" | "sim") => run(async () => {
    const f = fixRef.current;
    if (mode === "real" && !f) return;
    const body = mode === "sim"
      ? { lat: shop.lat, lng: shop.lng, accuracyM: 5, simulated: true }
      : { lat: f!.lat, lng: f!.lng, accuracyM: Math.round(f!.accuracyM) };
    const scope = `checkin:${visit.id}:${mode}`;
    try {
      // Same body → same key, so a retry of this exact attempt replays instead of double-checking-in. A new
      // GPS fix is a new body and gets a new key (reusing the old key with it would be 422 KEY_REUSED); if the
      // lost attempt did commit, the server answers ALREADY_CHECKED_IN and we sync.
      await api(`/visits/${visit.id}/check-in`, { body, idempotencyKey: opKey.for(scope, JSON.stringify(body)) });
      opKey.clear(scope);
      sync("visit.checked_in");
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        opKey.clear(scope);
        const det = (e.details ?? {}) as { distanceM?: number; radiusM?: number; visitId?: string };
        if (e.code === "OUTSIDE_GEOFENCE") { toast.error(`You're ${fmtDistance(det.distanceM ?? shown)} from ${shop.name}. Check-in opens within ${det.radiusM ?? radius} m.`); void fence.refetch(); }
        else if (e.code === "ANOTHER_VISIT_OPEN" && det.visitId) toast.error("You're still checked in at another shop. Complete that visit first.", { action: { label: "Open it", onClick: () => router.push(`/field/visits/${det.visitId}`) } });
        else if (e.code === "ALREADY_CHECKED_IN") sync("visit.checked_in");
        else toast.error(errorMessage(e));
      } else {
        // Unknown outcome (no answer / 5xx): re-read the visit so the screen shows what the server holds —
        // never assume it worked, never assume it didn't.
        sync("visit.checked_in");
        toast.error("We couldn't confirm the check-in. Tap Check in again; it is never recorded twice.");
      }
    }
  });

  const helper = !geo.fix ? null : inside ? null : shown !== undefined ? `Move within ${radius} m to check in` : null;
  // The server says whether this visit can be checked in at all (today's, no other visit open). A simulated
  // arrival is a check-in too, so it is offered only when a real one would be — with the reason when not.
  const blocked = data.resume?.blockedBy;
  const simBlocked = data.resume?.canCheckIn === false
    ? blocked?.code === "ANOTHER_VISIT_OPEN" ? "Simulated arrival is off while another visit is open. Complete that visit first."
      : blocked?.code === "VISIT_NOT_TODAY" ? `Simulated arrival opens on the day of the visit, like check-in (planned for ${fmtWeekday(visit.plannedDate)}).`
        : "Simulated arrival is not available for this visit."
    : null;

  return (
    <>
      <div className="px-4">
        <div className="relative h-[200px] overflow-hidden rounded-xl border border-line bg-sunken">
          <FieldMap
            markers={[{ id: shop.id, lat: shop.lat, lng: shop.lng, label: shop.name, sublabel: shop.address, tone: inside ? "active" : "next", badge: visit.sequence }]}
            me={geo.fix} fence={{ lat: shop.lat, lng: shop.lng, radiusM: radius, inside, outsideColor: "#a8661a" }} initialZoom={15} markerStyle="numbered" selectedId={shop.id}
          />
          <a href={mapsDirections(shop.lat, shop.lng)} target="_blank" rel="noreferrer"
            className={cn("absolute bottom-2 left-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink shadow-float", PRESS)}>
            <Navigation className="size-3.5" />Directions
          </a>
        </div>
      </div>

      <GeoPanel geo={geo} inside={inside} server={fresh ? server : undefined} shown={shown} radius={radius} shopName={shop.name}
        verifying={!inside && locallyInside} serverError={fence.isError && !fresh} demo={demo} simBlocked={simBlocked} />

      <BottomBar>
        {helper && <p className="mb-2 text-center text-[13px] text-ink-2">{helper}, you’re <span className="num font-medium text-ink">{fmtDistance(shown)}</span> away</p>}
        {geoFailed(geo.status) && demo && !simBlocked ? (
          <>
            <Button variant="outline" className={cn("h-12 w-full border-info/30 bg-info-soft text-[15px] text-info hover:bg-info-soft hover:text-info", PRESS_BTN)} disabled={busy} onClick={() => checkIn("sim")}>
              {busy ? <Loader2 className="animate-spin" /> : <Radar />}Simulate arrival (demo)
            </Button>
            <p className="mt-2 text-center text-[12px] text-ink-3">Recorded as simulated for your manager, never as GPS verified.</p>
          </>
        ) : (
          <Button className={cn("h-12 w-full text-[15px]", PRESS_BTN)} disabled={!inside || busy || data.resume?.canCheckIn === false} onClick={() => checkIn("real")}>
            {busy ? <Loader2 className="animate-spin" /> : <LocateFixed />}Check in
          </Button>
        )}
        {geoFailed(geo.status) && !demo && <p className="mt-2 text-center text-[13px] text-ink-3">Check-in unlocks once your location is available.</p>}
        {demo && !geoFailed(geo.status) && simBlocked && <p className="mt-2 text-center text-[13px] text-ink-3">{simBlocked}</p>}
        {demo && !geoFailed(geo.status) && !simBlocked && (
          <button type="button" disabled={busy} onClick={() => checkIn("sim")}
            className="mx-auto mt-1 flex min-h-11 items-center gap-1.5 px-3 text-[13px] font-medium text-info transition-opacity duration-150 active:opacity-60 disabled:opacity-50">
            <Radar className="size-3.5" />Simulate arrival (demo, recorded as simulated)
          </button>
        )}
      </BottomBar>
    </>
  );
}

function GeoPanel({ geo, inside, server, shown, radius, shopName, verifying, serverError, demo, simBlocked }: {
  geo: FieldGeo; inside: boolean; server?: GeofenceCheck; shown?: number; radius: number; shopName: string;
  verifying: boolean; serverError: boolean; demo: boolean; simBlocked: string | null;
}) {
  const wrap = "mx-4 mt-3";
  if (geoFailed(geo.status)) {
    const copy = {
      denied: ["Location is blocked for JewelRoute", "Check-in needs your position to prove you're at the shop. Allow location for this site (browser settings, Site settings, Location), then retry."],
      unavailable: ["This browser can't share location", "Open JewelRoute in Chrome or Safari on your phone to check in."],
      timeout: ["No GPS fix yet", "Indoors or between tall buildings the signal is weak. Step outside or near the shop door, then retry."],
      error: ["We can't get a GPS fix", "Turn on location services for your phone, then retry."],
    } as const;
    const [title, body] = copy[geo.status as keyof typeof copy];
    return (
      <Notice tone="warn" icon={LocateOff} role="alert" className={wrap} title={title}
        action={geo.status !== "unavailable" ? <Button variant="outline" className={cn("h-11 bg-paper px-3.5 text-[14px]", PRESS_BTN)} onClick={geo.retry}><RotateCw />Retry location</Button> : undefined}>
        {body}
        {demo && simBlocked && <span className="mt-2 block text-[12px] text-ink-3">{simBlocked}</span>}
      </Notice>
    );
  }
  if (shown === undefined) {
    return (
      <Notice tone="neutral" icon={Loader2Spin} role="status" className={wrap} title="Finding your location">
        Allow location when your browser asks. Indoors this can take a few seconds.
      </Notice>
    );
  }
  if (inside) {
    const low = server?.verification === "LOW_ACCURACY";
    return (
      <Notice tone={low ? "warn" : "neutral"} icon={CheckCircle2} role="status" className={cn(wrap, "transition-opacity duration-200 starting:opacity-0")}
        title={<span className={low ? "text-warn" : "text-ink"}>You’re at {shopName}</span>}
        aside={Math.round(server?.distanceM ?? shown ?? 0) > 0 ? <span className="num shrink-0 text-[15px] font-semibold text-ink">{fmtDistance(server?.distanceM ?? shown)}</span> : undefined}>
        {low ? <>GPS is imprecise (<span className="num">±{Math.round(geo.fix?.accuracyM ?? 0)} m</span>). Check-in will be marked low accuracy.</> : <>Inside the <span className="num">{radius} m</span> zone. Check in to start the visit.</>}
      </Notice>
    );
  }
  if (verifying) {
    return (
      <Notice tone="neutral" icon={Loader2Spin} role="status" className={wrap} title="Verifying your position"
        aside={<span className="num shrink-0 text-[15px] font-semibold text-ink">{fmtDistance(shown)}</span>}>
        {serverError ? "Can't reach JewelRoute to confirm. Retrying every few seconds." : "Confirming with the server. Only the server decides you're inside."}
      </Notice>
    );
  }
  return (
    <div className={cn(wrap, "rounded-xl border border-line px-4 py-3.5")} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="num text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">{fmtDistance(shown)}</p>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-[13px] font-medium text-warn"><span className="size-1.5 rounded-full bg-warn" />Outside the zone</span>
      </div>
      <p className="mt-2 text-[14px] leading-snug text-ink-2">
        From {shopName}. Check-in opens within <span className="num">{radius} m</span>.{" "}
        {serverError ? "Server check failed, retrying." : geo.fix && geo.fix.accuracyM >= 1 ? <span className="text-ink-3">GPS <span className="num">±{Math.round(geo.fix.accuracyM)} m</span>.</span> : null}
      </p>
    </div>
  );
}

/** Lucide spinner that fits Notice's icon slot (a faster spin reads as a faster app). */
function Loader2Spin({ className }: { className?: string }) {
  return <Loader2 className={cn(className, "animate-spin [animation-duration:700ms]")} />;
}
