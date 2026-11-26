import { NextResponse } from "next/server";

import { sessionCookie, signSession } from "@/lib/auth/jwt";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/password";
import type { Role } from "@/lib/auth/permissions";
import { resetPassword } from "@/lib/auth/service";

/** Sets a new password from a reset link, then signs in with it (every other session has ended). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: unknown; password?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const result = await resetPassword(token, password);
  if (!result.ok)
    return result.reason === "weak-password"
      ? NextResponse.json(
          {
            error: {
              code: "weak_password",
              field: "password",
              message: `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`,
            },
          },
          { status: 400 },
        )
      : NextResponse.json(
          {
            error: {
              code: "invalid_link",
              message: "This reset link has expired or was already used. Ask for a new one.",
            },
          },
          { status: 400 },
        );

  const { user } = result;
  const response = NextResponse.json({ name: user.name });
  response.cookies.set(
    sessionCookie(
      await signSession({ userId: String(user._id), sessionVersion: user.sessionVersion, role: user.role as Role }),
    ),
  );
  return response;
}
