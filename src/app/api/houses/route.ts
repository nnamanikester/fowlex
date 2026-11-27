import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createHouse } from "@/lib/houses/service";

/** Adds a house (owners: houses are farm settings). */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("settings.manage");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createHouse(actor, body), { status: 201 });
});
