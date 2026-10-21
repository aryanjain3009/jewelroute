import { NextResponse, type NextRequest } from "next/server";
import { areaFor, destination, homeFor, inArea, roleFromAccessToken } from "@/lib/auth-redirect";

/** Cheap routing gate. Real authorization (role + tenant) is enforced by the API on every call; this only
 *  keeps people on the right screens:
 *  - no session cookie at all → /login?next=<path + query>, so sign-in returns to exactly this screen;
 *  - a live access token for the other role's area → that role's home (an agent never renders /admin);
 *  - /login while the access token is live → home (or a valid ?next=). With only a refresh cookie the
 *    login page asks the API (which refreshes) and redirects from the client. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const role = roleFromAccessToken(req.cookies.get("jr_at")?.value);

  if (pathname === "/login") {
    if (!role) return NextResponse.next();
    return NextResponse.redirect(new URL(destination(role, req.nextUrl.searchParams.get("next")), req.url));
  }

  const has = req.cookies.has("jr_at") || req.cookies.has("jr_rt");
  if (!has) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (role && !inArea(pathname, areaFor(role))) return NextResponse.redirect(new URL(homeFor(role), req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/field/:path*", "/admin/:path*", "/login"] };
