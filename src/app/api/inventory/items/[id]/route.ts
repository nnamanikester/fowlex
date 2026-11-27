import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteItem, updateItem } from "@/lib/inventory/items";

/** Saves an item; the body carries the `version` the form loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/inventory/items/[id]">) => {
  const actor = await requirePermission("inventory.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateItem(actor, (await context.params).id, body, version));
});

/** Removes an item with no stock history. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/inventory/items/[id]">) => {
  const actor = await requirePermission("inventory.write");
  await deleteItem(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
