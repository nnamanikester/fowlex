import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";
import { homeFor } from "@/lib/auth/permissions";

/** Pages and APIs anyone may reach: sign-in, the design system, the public order page, and the auth endpoints. */
// Webhooks prove who they are with a signature, not a session; cron jobs with CRON_SECRET.
const PUBLIC = [
  "/auth",
  "/design",
  "/order",
  "/pay",
  "/dev",
  "/api/auth",
  "/api/dev",
  "/api/webhooks",
  "/api/cron",
  "/api/public",
];
/** Where customers may go, and nobody else. */
const PORTAL = ["/portal", "/api/portal"];

/**
 * The first check on every request: a visitor without a valid session is sent to sign in (pages)
 * or told 401 (APIs). It only checks the token; pages and APIs check the user in the database too,
 * so a turned-off account is caught there.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (session && pathname === "/auth/login") return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  if (isPublic) return NextResponse.next();

  if (session) {
    // Customers live in the portal; everyone else in the dashboard. Pages check again on the server.
    const portal = PORTAL.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (portal === (session.role === "customer")) return NextResponse.next();
    if (pathname.startsWith("/api/"))
      return NextResponse.json({ error: { code: "forbidden", message: "Your role can't do this." } }, { status: 403 });
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }

  if (pathname.startsWith("/api/"))
    return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in first." } }, { status: 401 });
  const login = new URL("/auth/login", request.url);
  if (pathname !== "/") login.searchParams.set("redirect", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything but Next's own files and the public folder's images.
  matcher: ["/((?!_next/static|_next/image|icon.png|apple-icon.png|brand/).*)"],
};
