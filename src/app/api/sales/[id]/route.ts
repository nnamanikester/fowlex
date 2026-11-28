import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteOrder, updateOrder } from "@/lib/sales/service";

/** Changes an order (and its invoice) until it's paid; the body carries the `version` the form loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/sales/[id]">) => {
  const actor = await requirePermission("sales.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateOrder(actor, (await context.params).id, body, version));
});

/** Deletes an order and its invoice, until it's paid: what it changed comes back. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/sales/[id]">) => {
  const actor = await requirePermission("sales.write");
  await deleteOrder(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
