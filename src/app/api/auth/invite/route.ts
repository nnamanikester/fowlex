import { NextResponse } from "next/server";

import { sessionCookie, signSession } from "@/lib/auth/jwt";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/password";
import { homeFor, type Role } from "@/lib/auth/permissions";
import { acceptInvite } from "@/lib/users/service";

/** Accepts an invite: creates the account and signs in. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown; name?: unknown; password?: unknown };
  const result = await acceptInvite(String(body.token ?? ""), {
    name: String(body.name ?? ""),
    password: String(body.password ?? ""),
  });
  if (!result.ok) {
    const [status, code, field, message] =
      result.reason === "name"
        ? [400, "invalid_name", "name", "Enter your name."]
        : result.reason === "weak-password"
          ? [400, "weak_password", "password", `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`]
          : [
              400,
              "invalid_link",
              undefined,
              "This invite has expired, was cancelled or was already used. Ask for a new one.",
            ];
    return NextResponse.json({ error: { code, field, message } }, { status });
  }
  const { user } = result;
  const role = user.role as Role;
  const response = NextResponse.json({ home: homeFor(role) });
  response.cookies.set(
    sessionCookie(await signSession({ userId: String(user._id), sessionVersion: user.sessionVersion, role })),
  );
  return response;
}
