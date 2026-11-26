import { NextResponse } from "next/server";

import { requestPasswordReset } from "@/lib/auth/service";

/**
 * Emails a reset link. Always answers the same way, whether or not the email has an account, so
 * the form can't be used to find out who uses Fowlex.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email)
    return NextResponse.json({ error: { code: "missing_fields", message: "Enter your email." } }, { status: 400 });
  await requestPasswordReset(email, new URL(request.url).origin);
  return NextResponse.json({ sent: true });
}
