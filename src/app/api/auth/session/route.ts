import { NextResponse } from "next/server";

import { clearedSessionCookie } from "@/lib/auth/jwt";

/** Signs out of this browser by clearing the session cookie. */
export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(clearedSessionCookie);
  return response;
}
