import { NextResponse, type NextRequest } from "next/server";

/** Cheap gate: bounce to /login when there is no session cookie at all.
 *  Real authorization (role + tenant) is enforced by the API on every call. */
export function middleware(req: NextRequest) {
  const has = req.cookies.has("jr_at") || req.cookies.has("jr_rt");
  if (!has) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/field/:path*", "/admin/:path*"] };
