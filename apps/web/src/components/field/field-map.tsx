"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import type { MapProps } from "@/components/jr/map";

/** JrMap is browser-only (MapLibre touches window at import). */
const Map = dynamic<MapProps>(() => import("@/components/jr/map").then((m) => m.JrMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-sunken" />,
});

/** On small field maps the compact attribution starts expanded and (on a non-interactive map) never
 *  collapses; keep it as the ⓘ button so it doesn't cover the route. */
export function FieldMap(props: MapProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const collapse = () => el.querySelectorAll(".maplibregl-compact-show").forEach((n) => n.classList.remove("maplibregl-compact-show"));
    const mo = new MutationObserver(collapse);
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
    collapse();
    const t = setTimeout(() => mo.disconnect(), 4000);
    return () => { mo.disconnect(); clearTimeout(t); };
  }, []);
  return <div ref={ref} className="h-full w-full"><Map {...props} /></div>;
}
