/** Where a signed-in user goes. Pure, so both the middleware (edge) and the login page use the same rule.
 *  `next` is honoured only when it is a same-origin path inside the area this role can use, so a crafted
 *  link can never send anyone off-site (open redirect) or an agent into /admin. */
import type { Role } from "./types";

export const homeFor = (role: Role | string | undefined) => (role === "ADMIN" ? "/admin" : "/field/today");
export const areaFor = (role: Role | string | undefined) => (role === "ADMIN" ? "/admin" : "/field");

/** `/admin`, `/admin/…`, `/admin?…` belong to `/admin`; `/administrator` does not. */
export const inArea = (path: string, area: string) =>
  path === area || path.startsWith(`${area}/`) || path.startsWith(`${area}?`) || path.startsWith(`${area}#`);

export function safeNext(next: string | null | undefined, role: Role | string | undefined): string | null {
  if (!next || next.length > 2048) return null;
  // Same-origin absolute path only: no scheme, no protocol-relative `//host`, no `/\host` (browsers read it as `//`).
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return null;
  return inArea(next, areaFor(role)) ? next : null;
}

export const destination = (role: Role | string | undefined, next: string | null | undefined) => safeNext(next, role) ?? homeFor(role);

/** Role from the access-token cookie WITHOUT verifying it — routing only; the API verifies every call.
 *  Returns null when there is no usable token (missing, malformed or expired). */
export function roleFromAccessToken(token: string | undefined, nowSec = Math.floor(Date.now() / 1000)): string | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    if (typeof json?.exp === "number" && json.exp <= nowSec) return null;
    return typeof json?.role === "string" ? json.role : null;
  } catch { return null; }
}
