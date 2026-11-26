import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { inviteUser } from "@/lib/users/service";

/** Invites someone to the farm with a role (owners only). */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("settings.manage");
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; role?: unknown };
  const result = await inviteUser(
    actor,
    { email: String(body.email ?? ""), role: String(body.role ?? "") },
    new URL(request.url).origin,
  );
  return NextResponse.json(result, { status: 201 });
});
