"use client";
/** Device position for the field app, with the failure modes an agent actually meets:
 *  permission denied, no geolocation in this browser, no fix in time (indoors). The server re-verifies
 *  every fix; this is only the input. */
import { useCallback, useEffect, useRef, useState } from "react";

export interface GeoFix { lat: number; lng: number; accuracyM: number; at: number }
export type GeoStatus = "idle" | "locating" | "watching" | "denied" | "unavailable" | "timeout" | "error";
export interface FieldGeo { status: GeoStatus; fix: GeoFix | null; error?: string; retry: () => void }

const TIMEOUT_MS = 15_000;

export function useFieldGeo(enabled = true): FieldGeo {
  const [state, set] = useState<{ status: GeoStatus; fix: GeoFix | null; error?: string }>({ status: "idle", fix: null });
  const watch = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    if (timer.current) clearTimeout(timer.current);
    watch.current = null; timer.current = null;
  };

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { set({ status: "unavailable", fix: null }); return; }
    stop();
    set((s) => ({ ...s, status: s.fix ? "watching" : "locating", error: undefined }));
    // watchPosition's own timeout only fires per attempt and some browsers never call back; keep our own clock.
    timer.current = setTimeout(() => set((s) => (s.fix ? s : { ...s, status: "timeout" })), TIMEOUT_MS);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        set({ status: "watching", fix: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, at: p.timestamp } });
      },
      (e) => set((s) => ({
        ...s,
        status: e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? (s.fix ? "watching" : "timeout") : s.fix ? "watching" : "error",
        error: e.message,
      })),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: TIMEOUT_MS },
    );
  }, []);

  useEffect(() => {
    if (enabled) start();
    return stop;
  }, [enabled, start]);

  return { ...state, retry: start };
}

export const geoFailed = (s: GeoStatus) => s === "denied" || s === "unavailable" || s === "timeout" || s === "error";
