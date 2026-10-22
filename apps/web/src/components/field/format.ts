// Field-side display helpers. IST everywhere; Indian number style comes from @jewelroute/shared.
import { addDays, istDate } from "@jewelroute/shared";

const TZ = "Asia/Kolkata";

/** "11:42 am" */
export function fmtTime(iso?: string | number | Date | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(iso)).replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`);
}
/** Planned slot "14:30" → { t: "2:30", ap: "pm" } (IST wall clock, no conversion). */
export function plannedParts(hhmm?: string | null) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return { t: `${h % 12 || 12}:${String(m).padStart(2, "0")}`, ap: h < 12 ? "am" : "pm" };
}
export const fmtPlanned = (hhmm?: string | null) => { const p = plannedParts(hhmm); return p ? `${p.t} ${p.ap}` : ""; };

const asDate = (iso: string | Date) => (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00+05:30`) : new Date(iso));
/** "21 Oct" */
export function fmtDay(iso?: string | Date | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short" }).format(asDate(iso));
}
/** "Tue, 21 Oct" */
export function fmtWeekday(iso?: string | Date | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(asDate(iso));
}
/** "Today" / "Yesterday" / "Tomorrow" / "Mon, 19 Oct" for a YYYY-MM-DD business date. */
export function dayLabel(ymd: string, today = istDate()) {
  if (ymd === today) return "Today";
  if (ymd === addDays(today, -1)) return "Yesterday";
  if (ymd === addDays(today, 1)) return "Tomorrow";
  return fmtWeekday(ymd);
}
/** "Good morning" by IST wall clock. */
export function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", hour12: false }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
/** "214 m" / "1.2 km" */
export function fmtDistance(m?: number | null) {
  if (m === undefined || m === null || !Number.isFinite(m)) return "";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}
/** "38 m from the shop", or "at the shop" when the server measured 0 m (never "0 m"). */
export const fmtFromShop = (m: number) => (Math.round(m) === 0 ? "at the shop" : `${fmtDistance(m)} from the shop`);
/** "Due in 3 days" / "Due today" / "2 days overdue" */
export function fmtDue(daysToDue: number) {
  if (daysToDue === 0) return "Due today";
  if (daysToDue === 1) return "Due tomorrow";
  if (daysToDue > 1) return `Due in ${daysToDue} days`;
  return `${Math.abs(daysToDue)} day${daysToDue === -1 ? "" : "s"} overdue`;
}
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const firstName = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** The API may hand back a path on its own origin for local uploads; route it through the same-origin proxy. */
export function mediaUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("/v1/")) return `/api${url}`;
  return url;
}

/** Ask the image CDN for a size that fits the slot (phones on mobile data shouldn't pull 1200px for a 48px thumb). */
export function sizedMedia(url: string | null | undefined, w: number) {
  const u = mediaUrl(url);
  if (!u.includes("images.unsplash.com")) return u;
  return /[?&]w=\d+/.test(u) ? u.replace(/([?&])w=\d+/, `$1w=${w}`) : `${u}${u.includes("?") ? "&" : "?"}w=${w}`;
}

export const mapsDirections = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
