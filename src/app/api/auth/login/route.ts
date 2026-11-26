import { NextResponse } from "next/server";

import { sessionCookie, signSession } from "@/lib/auth/jwt";
import type { Role } from "@/lib/auth/permissions";
import { LOCK_AFTER, login } from "@/lib/auth/service";

/** Signs in: checks the email and password, then sets the session cookie. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return error(400, "missing_fields", "Enter your email and password.");

  const result = await login(email, password);
  if (!result.ok) {
    if (result.reason === "locked")
      return error(
        429,
        "locked",
        `Too many wrong passwords. Try again in ${result.minutes} minute${result.minutes === 1 ? "" : "s"}, or reset your password.`,
      );
    if (result.reason === "disabled")
      return error(403, "disabled", "This account is turned off. Ask a partner at your farm to turn it back on.");
    return error(
      401,
      "invalid_credentials",
      `That email and password don't match. After ${LOCK_AFTER} tries in a row, sign-in pauses for a while.`,
    );
  }

  const { user } = result;
  const token = await signSession({
    userId: String(user._id),
    sessionVersion: user.sessionVersion,
    role: user.role as Role,
  });
  const response = NextResponse.json({ name: user.name, role: user.role });
  response.cookies.set(sessionCookie(token));
  return response;
}

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}
