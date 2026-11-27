import { NextResponse } from "next/server";

import { deleteAsset, updateAsset } from "@/lib/assets/service";
import { apiRoute, requirePermission } from "@/lib/auth/guard";

/** Saves equipment; the body carries the `version` the form loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/assets/[id]">) => {
  const actor = await requirePermission("expense.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateAsset(actor, (await context.params).id, body, version));
});

/** Removes equipment added by hand. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/assets/[id]">) => {
  const actor = await requirePermission("expense.write");
  await deleteAsset(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
