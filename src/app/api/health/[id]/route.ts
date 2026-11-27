import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteHealthEvent, updateHealthEvent } from "@/lib/health/service";

/** Changes a health record; carries the `version` the form loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/health/[id]">) => {
  const actor = await requirePermission("log.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateHealthEvent(actor, (await context.params).id, body, version));
});

/** Removes a health record: managers and owners. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/health/[id]">) => {
  const actor = await requirePermission("batch.write");
  await deleteHealthEvent(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
