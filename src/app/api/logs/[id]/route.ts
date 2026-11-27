import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteLog, updateLog } from "@/lib/logs/service";

/** Changes a log; carries the `version` the form loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/logs/[id]">) => {
  const actor = await requirePermission("log.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateLog(actor, (await context.params).id, body, version));
});

/** Removes a log: managers and owners. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/logs/[id]">) => {
  const actor = await requirePermission("batch.write");
  await deleteLog(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
