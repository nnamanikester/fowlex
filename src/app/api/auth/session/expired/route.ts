import { NextResponse } from "next/server";

import { clearedSessionCookie } from "@/lib/auth/jwt";

/**
 * Where a page sends someone whose session has ended (account turned off, role changed, password
 * reset) though their cookie is still validly signed: clear it, then go to sign in. Without this
 * the proxy would see the cookie and bounce them straight back from the sign-in page.
 */
export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/auth/login?reason=expired", request.url));
  response.cookies.set(clearedSessionCookie);
  return response;
}
