import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteHouse, updateHouse } from "@/lib/houses/service";

/** Saves a house. The body carries the `version` the form loaded, so a stale form is refused. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/houses/[id]">) => {
  const actor = await requirePermission("settings.manage");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateHouse(actor, (await context.params).id, body, version));
});

/** Removes a house that has never held a batch. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/houses/[id]">) => {
  const actor = await requirePermission("settings.manage");
  await deleteHouse(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
