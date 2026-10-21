"use client";
/** MapLibre GL + OpenFreeMap tiles (no API key, OSM data). One map component for field and admin.
 *  Markers are plain DOM so they can carry our type and status colours. */
import maplibregl, { type LngLatLike, type Map as MLMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type MapTone = "planned" | "active" | "done" | "alert" | "next" | "muted" | "gold";
export interface MapMarker { id: string; lat: number; lng: number; label?: string; sublabel?: string; tone?: MapTone; badge?: string | number; onClick?: () => void }
export interface MapProps {
  markers: MapMarker[];
  me?: { lat: number; lng: number; accuracyM?: number } | null;
  /** Draw a geofence circle (metres) around a point. */
  fence?: { lat: number; lng: number; radiusM: number; inside?: boolean; outsideColor?: string } | null;
  /** "numbered" (field): a 22px circle with the route number inside, the label pill only on the selected
   *  stop, and the agent's dot drawn under the markers. Default keeps the pill markers. */
  markerStyle?: "pill" | "numbered";
  /** Connect markers in this order with a dashed route line. */
  route?: string[];
  className?: string;
  initialZoom?: number;
  selectedId?: string | null;
  interactive?: boolean;
  /** Small non-interactive dots (e.g. GPS check-in fixes). Additive; optional. */
  points?: { id: string; lat: number; lng: number; color?: string; title?: string }[];
}

const STYLE = "https://tiles.openfreemap.org/styles/positron";

/** The OpenFreeMap style compares feature properties as numbers (`ref_length`, `admin_level`, `rank`), but
 *  Indian OSM data has roads and places where they are null, and MapLibre warns "Expected value to be of
 *  type number, but found null instead" for each one, on every map. Guard each numeric comparison of a
 *  `get` with a type check (`all` short-circuits), so those features simply don't match — same rendering,
 *  no warning. */
const CMP = new Set(["<", "<=", ">", ">="]);
type Expr = unknown;
function guardNumeric(e: Expr): Expr {
  if (!Array.isArray(e)) return e;
  const [op, a, b] = e as [unknown, unknown, unknown];
  const isGet = (x: unknown): x is ["get", string] => Array.isArray(x) && x[0] === "get" && x.length === 2 && typeof x[1] === "string";
  if (typeof op === "string" && CMP.has(op) && e.length === 3 && (isGet(a) || isGet(b))) {
    const g = (isGet(a) ? a : b) as ["get", string];
    return ["all", ["==", ["typeof", g], "number"], e];
  }
  return e.map(guardNumeric);
}
function guardStyle(next: maplibregl.StyleSpecification): maplibregl.StyleSpecification {
  return {
    ...next,
    layers: next.layers.map((l) => {
      const out = { ...l } as Record<string, unknown>;
      if ("filter" in l && l.filter) out.filter = guardNumeric(l.filter);
      if ("layout" in l && l.layout) out.layout = Object.fromEntries(Object.entries(l.layout).map(([k, v]) => [k, guardNumeric(v)]));
      if ("paint" in l && l.paint) out.paint = Object.fromEntries(Object.entries(l.paint).map(([k, v]) => [k, guardNumeric(v)]));
      return out as unknown as maplibregl.LayerSpecification;
    }),
  };
}
const TONE: Record<MapTone, { bg: string; fg: string; ring: string }> = {
  planned: { bg: "#ffffff", fg: "#191714", ring: "#d6d0c3" },
  next: { bg: "#191714", fg: "#fcfbf8", ring: "#191714" },
  active: { bg: "#2c7a54", fg: "#ffffff", ring: "#2c7a54" },
  done: { bg: "#e5f2ea", fg: "#2c7a54", ring: "#9fcbb3" },
  alert: { bg: "#b23a2b", fg: "#ffffff", ring: "#b23a2b" },
  muted: { bg: "#f5f3ee", fg: "#8f897d", ring: "#e9e5dc" },
  gold: { bg: "#b08a35", fg: "#ffffff", ring: "#b08a35" },
};

function circle(lat: number, lng: number, radiusM: number, steps = 64) {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coords] } };
}

export function JrMap({ markers, me, fence, route, className, initialZoom = 12, selectedId, interactive = true, points, markerStyle = "pill" }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const loaded = useRef(false);
  const domMarkers = useRef<maplibregl.Marker[]>([]);
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    const first = markers[0] ?? me;
    map.current = new maplibregl.Map({
      container: el.current,
      center: first ? [first.lng, first.lat] : [77.209, 28.6139], zoom: initialZoom,
      attributionControl: { compact: true }, interactive, cooperativeGestures: false,
    });
    map.current.setStyle(STYLE, { transformStyle: (_prev, next) => guardStyle(next) });
    if (interactive) map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // Markers and the camera don't need tiles; layers only need the style. Drawing on "style.load"
    // (not just "load", which waits for every first tile) keeps the map useful when a tile host is slow or blocked.
    map.current.on("style.load", () => { loaded.current = true; draw(); });
    map.current.on("load", () => { loaded.current = true; draw(); });
    draw();
    return () => { map.current?.remove(); map.current = null; loaded.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const m = map.current; if (!m) return;
    domMarkers.current.forEach((d) => d.remove()); domMarkers.current = [];
    const numbered = markerStyle === "numbered";
    const meNode = () => {
      const node = document.createElement("div");
      node.style.cssText = "width:16px;height:16px;border-radius:999px;background:#2f5f8f;border:3px solid #fff;box-shadow:0 0 0 6px rgb(47 95 143/.18)";
      return node;
    };
    if (numbered && me) domMarkers.current.push(new maplibregl.Marker({ element: meNode() }).setLngLat([me.lng, me.lat]).addTo(m));

    for (const mk of markers) {
      if (numbered) {
        const tone = TONE[mk.tone ?? "planned"];
        const sel = selectedId === mk.id;
        const node = document.createElement("button");
        node.type = "button";
        node.setAttribute("aria-label", mk.label ?? "Shop");
        node.style.cssText = "display:flex;align-items:center;gap:6px;background:none;border:0;padding:0;cursor:pointer;font:600 12px/1 var(--font-ui),system-ui";
        const dot = document.createElement("span");
        dot.textContent = mk.badge !== undefined ? String(mk.badge) : "";
        dot.style.cssText = `width:22px;height:22px;border-radius:999px;display:grid;place-items:center;background:${tone.bg};color:${tone.fg};border:1.5px solid ${tone.ring};box-shadow:0 1px 2px rgb(0 0 0/.08),0 4px 10px -4px rgb(0 0 0/.25);font-size:11px`;
        node.append(dot);
        if (mk.label && sel) {
          const l = document.createElement("span");
          l.textContent = mk.label;
          l.style.cssText = "padding:4px 8px;border-radius:8px;background:#fff;color:#1c1d1f;border:1px solid #e3e3e3;box-shadow:0 4px 12px -6px rgb(0 0 0/.25);white-space:nowrap";
          node.append(l);
        }
        if (mk.onClick) node.addEventListener("click", (e) => { e.stopPropagation(); mk.onClick!(); });
        // Anchor on the circle's centre (the label hangs off to the right).
        const marker = new maplibregl.Marker({ element: node, anchor: "left", offset: [-11, 0] }).setLngLat([mk.lng, mk.lat]);
        marker.addTo(m); domMarkers.current.push(marker);
        continue;
      }
      const tone = TONE[mk.tone ?? "planned"];
      const node = document.createElement("button");
      node.type = "button";
      node.setAttribute("aria-label", mk.label ?? "Shop");
      const sel = selectedId === mk.id;
      node.style.cssText = `display:flex;align-items:center;gap:6px;padding:${mk.badge !== undefined ? "4px 9px 4px 4px" : "4px"};border-radius:999px;background:${tone.bg};color:${tone.fg};border:1.5px solid ${tone.ring};font:600 12px/1 var(--font-ui),system-ui;box-shadow:0 1px 2px rgb(0 0 0/.06),0 6px 16px -6px rgb(0 0 0/.25);cursor:pointer;transform:${sel ? "scale(1.12)" : "none"};transition:transform .15s;white-space:nowrap`;
      const dot = document.createElement("span");
      dot.style.cssText = `width:18px;height:18px;border-radius:999px;display:grid;place-items:center;background:${tone.fg};color:${tone.bg};font-size:10px`;
      dot.textContent = mk.badge !== undefined ? "" : "";
      if (mk.badge !== undefined) { const b = document.createElement("span"); b.textContent = String(mk.badge); dot.textContent = ""; node.append(dot); node.append(b); dot.textContent = ""; }
      else node.append(dot);
      if (mk.label && sel) { const l = document.createElement("span"); l.textContent = mk.label; l.style.marginRight = "4px"; node.append(l); }
      if (mk.onClick) node.addEventListener("click", (e) => { e.stopPropagation(); mk.onClick!(); });
      const marker = new maplibregl.Marker({ element: node, anchor: "center" }).setLngLat([mk.lng, mk.lat]);
      if (mk.label && !mk.onClick) marker.setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(`<strong>${escapeHtml(mk.label)}</strong>${mk.sublabel ? `<div style="color:#5d584f;margin-top:2px">${escapeHtml(mk.sublabel)}</div>` : ""}`));
      marker.addTo(m); domMarkers.current.push(marker);
    }

    for (const p of points ?? []) {
      const node = document.createElement("div");
      node.title = p.title ?? "";
      node.style.cssText = `width:9px;height:9px;border-radius:999px;background:${p.color ?? "#2f5f8f"};border:2px solid #fff;box-shadow:0 0 0 1px rgb(0 0 0/.18)`;
      domMarkers.current.push(new maplibregl.Marker({ element: node }).setLngLat([p.lng, p.lat]).addTo(m));
    }

    if (me && !numbered) domMarkers.current.push(new maplibregl.Marker({ element: meNode() }).setLngLat([me.lng, me.lat]).addTo(m));

    const styleReady = loaded.current || m.isStyleLoaded();
    if (styleReady) drawLayers(m);
    fitOnce(m);
  }

  function drawLayers(m: MLMap) {
    const src = (id: string, data: GeoJSON.Feature | GeoJSON.FeatureCollection) => {
      const s = m.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (s) s.setData(data as never); else m.addSource(id, { type: "geojson", data: data as never });
    };
    const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

    src("jr-fence", fence ? circle(fence.lat, fence.lng, fence.radiusM) : empty);
    // inside: true = verified (green); false = outside (outsideColor, default gold); undefined = no fix yet
    // (field keeps its outsideColor, admin shows neutral grey).
    const fenceColor = fence?.inside ? "#2c7a54" : fence?.inside === false ? fence.outsideColor ?? "#b08a35" : fence?.outsideColor ?? "#8f9095";
    if (!m.getLayer("jr-fence-fill")) {
      m.addLayer({ id: "jr-fence-fill", type: "fill", source: "jr-fence", paint: { "fill-color": fenceColor, "fill-opacity": 0.1 } });
      m.addLayer({ id: "jr-fence-line", type: "line", source: "jr-fence", paint: { "line-color": fenceColor, "line-width": 1.5, "line-dasharray": [2, 2] } });
    } else {
      m.setPaintProperty("jr-fence-fill", "fill-color", fenceColor);
      m.setPaintProperty("jr-fence-line", "line-color", fenceColor);
    }

    const ordered = (route ?? []).map((id) => markers.find((x) => x.id === id)).filter(Boolean) as MapMarker[];
    src("jr-route", ordered.length > 1 ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ordered.map((x) => [x.lng, x.lat]) } } : empty);
    if (!m.getLayer("jr-route-line")) m.addLayer({ id: "jr-route-line", type: "line", source: "jr-route", paint: { "line-color": "#191714", "line-width": 1.5, "line-opacity": 0.55, "line-dasharray": [1, 2] } }, "jr-fence-fill");

  }

  function fitOnce(m: MLMap) {
    if (!fitted.current) {
      const pts: LngLatLike[] = markers.map((x) => [x.lng, x.lat] as [number, number]);
      if (me) pts.push([me.lng, me.lat]);
      if (pts.length > 1) {
        const b = new maplibregl.LngLatBounds(pts[0], pts[0]); pts.forEach((p) => b.extend(p));
        m.fitBounds(b, { padding: 56, maxZoom: 16, duration: 0 });
      } else if (pts.length === 1) m.jumpTo({ center: pts[0], zoom: fence ? 16 : 14 });
      fitted.current = true;
    }
  }

  useEffect(draw); // redraw on every prop change; cheap for < 100 markers

  return <div ref={el} className={cn("relative h-full w-full overflow-hidden bg-sunken", className)} />;
}

function escapeHtml(s: string) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
