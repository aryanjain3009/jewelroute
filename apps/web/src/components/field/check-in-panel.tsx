"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, LocateFixed, LocateOff, Navigation, Radar } from "lucide-react";
import { toast } from "sonner";
import { distanceM, geofenceDecision } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/session";
import { qk, useSync } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { FieldMap } from "./field-map";
import { errorMessage } from "./queries";
import { fmtDistance, mapsDirections } from "./format";
import { opKey, useGuard } from "./guard";
import { BottomBar, BottomSpacer } from "./top-bar";
import { geoFailed, useFieldGeo, type FieldGeo } from "./use-field-geo";
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
      // Same key for a retry of this attempt; the server replays instead of double-checking-in.
      await api(`/visits/${visit.id}/check-in`, { body, idempotencyKey: opKey.for(scope, mode) });
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
      } else toast.error("Check-in didn't reach JewelRoute. Nothing was recorded twice; tap Check in again.");
    }
  });

  const helper = !geo.fix ? null : inside ? null : shown !== undefined ? `Move within ${radius} m to check in` : null;

  return (
    <>
      <div className="px-4">
        <div className="relative h-[220px] overflow-hidden rounded-xl border border-line">
          <FieldMap
            markers={[{ id: shop.id, lat: shop.lat, lng: shop.lng, label: shop.name, sublabel: shop.address, tone: inside ? "active" : "next", badge: visit.sequence }]}
            me={geo.fix} fence={{ lat: shop.lat, lng: shop.lng, radiusM: radius, inside }} initialZoom={15} selectedId={shop.id}
          />
          <a href={mapsDirections(shop.lat, shop.lng)} target="_blank" rel="noreferrer"
            className="absolute bottom-2 left-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink shadow-float">
            <Navigation className="size-3.5" />Directions
          </a>
        </div>
      </div>

      <GeoPanel geo={geo} inside={inside} server={fresh ? server : undefined} shown={shown} radius={radius} shopName={shop.name}
        verifying={!inside && locallyInside} serverError={fence.isError && !fresh} demo={demo} onSimulate={() => checkIn("sim")} busy={busy} />

      <BottomSpacer h={demo ? 128 : 100} />
      <BottomBar>
        {helper && <p className="mb-2 text-center text-[13px] text-ink-2">{helper}, you’re <span className="num">{fmtDistance(shown)}</span> away</p>}
        <Button className="h-12 w-full text-[15px]" disabled={!inside || busy || data.resume?.canCheckIn === false} onClick={() => checkIn("real")}>
          {busy ? <Loader2 className="animate-spin" /> : <LocateFixed />}Check in
        </Button>
        {demo && !geoFailed(geo.status) && data.resume?.canCheckIn !== false && (
          <button type="button" disabled={busy} onClick={() => checkIn("sim")}
            className="mx-auto mt-1 flex min-h-10 items-center gap-1.5 px-3 text-[13px] font-medium text-info disabled:opacity-50">
            <Radar className="size-3.5" />Simulate arrival (demo, recorded as simulated)
          </button>
        )}
      </BottomBar>
    </>
  );
}

function GeoPanel({ geo, inside, server, shown, radius, shopName, verifying, serverError, demo, onSimulate, busy }: {
  geo: FieldGeo; inside: boolean; server?: GeofenceCheck; shown?: number; radius: number; shopName: string;
  verifying: boolean; serverError: boolean; demo: boolean; onSimulate: () => void; busy: boolean;
}) {
  const wrap = "mx-4 mt-3 rounded-xl border px-4 py-3.5";
  if (geoFailed(geo.status)) {
    const copy = {
      denied: ["Location is blocked for JewelRoute", "Check-in needs your position to prove you're at the shop. Allow location for this site (browser settings, Site settings, Location), then retry."],
      unavailable: ["This browser can't share location", "Open JewelRoute in Chrome or Safari on your phone to check in."],
      timeout: ["No GPS fix yet", "Indoors or between tall buildings the signal is weak. Step outside or near the shop door, then retry."],
      error: ["We can't get a GPS fix", "Turn on location services for your phone, then retry."],
    } as const;
    const [title, body] = copy[geo.status as keyof typeof copy];
    return (
      <div className={cn(wrap, "border-danger/20 bg-danger-soft")} role="alert">
        <div className="flex items-start gap-3">
          <LocateOff className="mt-0.5 size-5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-ink">{title}</p>
            <p className="mt-1 text-[14px] text-ink-2">{body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {geo.status !== "unavailable" && <Button variant="outline" className="h-10 bg-paper" onClick={geo.retry}>Retry location</Button>}
              {demo && <Button variant="outline" className="h-10 bg-paper text-info" disabled={busy} onClick={onSimulate}><Radar />Simulate arrival (demo)</Button>}
            </div>
            {demo && <p className="mt-2 text-[12px] text-ink-3">Demo workspace only. A simulated arrival is labelled as simulated for your manager.</p>}
          </div>
        </div>
      </div>
    );
  }
  if (shown === undefined) {
    return (
      <div className={cn(wrap, "flex items-center gap-3 border-line")}>
        <Loader2 className="size-5 animate-spin text-ink-3" />
        <div><p className="text-[15px] font-medium text-ink">Finding your location</p><p className="text-[13px] text-ink-2">Allow location when your browser asks.</p></div>
      </div>
    );
  }
  if (inside) {
    const low = server?.verification === "LOW_ACCURACY";
    return (
      <div className={cn(wrap, "flex items-center gap-3", low ? "border-warn/20 bg-warn-soft" : "border-verified/20 bg-verified-soft")} aria-live="polite">
        <CheckCircle2 className={cn("size-6 shrink-0", low ? "text-warn" : "text-verified")} />
        <div>
          <p className={cn("text-[15px] font-semibold", low ? "text-warn" : "text-verified")}>Location verified · <span className="num">{fmtDistance(server?.distanceM ?? shown)}</span></p>
          <p className="text-[13px] text-ink-2">{low ? <>GPS is imprecise (<span className="num">±{Math.round(geo.fix?.accuracyM ?? 0)} m</span>). Check-in will be marked low accuracy.</> : `Inside the ${radius} m zone at ${shopName}.`}</p>
        </div>
      </div>
    );
  }
  if (verifying) {
    return (
      <div className={cn(wrap, "flex items-center gap-3 border-line")} aria-live="polite">
        <Loader2 className="size-5 shrink-0 animate-spin text-verified" />
        <div>
          <p className="text-[15px] font-medium text-ink">Verifying · <span className="num">{fmtDistance(shown)}</span></p>
          <p className="text-[13px] text-ink-2">{serverError ? "Can't reach JewelRoute to confirm. Retrying every few seconds." : "Confirming your position with the server."}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={cn(wrap, "border-line")} aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <p className="num text-[24px] font-semibold tracking-[-0.02em] text-ink">{fmtDistance(shown)}</p>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-warn"><span className="size-2 rounded-full bg-warn" />Outside the zone</span>
      </div>
      <p className="mt-0.5 text-[13px] text-ink-2">
        From {shopName}. Check-in opens within {radius} m.{" "}
        {serverError ? "Server check failed, retrying." : geo.fix && geo.fix.accuracyM >= 1 ? <>GPS <span className="num">±{Math.round(geo.fix.accuracyM)} m</span>.</> : null}
      </p>
    </div>
  );
}
