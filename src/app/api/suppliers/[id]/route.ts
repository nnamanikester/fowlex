import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteSupplier, updateSupplier } from "@/lib/suppliers/service";

/** Saves a supplier; the body carries the `version` the form loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/suppliers/[id]">) => {
  const actor = await requirePermission("supplier.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateSupplier(actor, (await context.params).id, body, version));
});

/** Removes a supplier. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/suppliers/[id]">) => {
  const actor = await requirePermission("supplier.write");
  await deleteSupplier(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
