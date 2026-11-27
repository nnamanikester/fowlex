import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { updateOrder } from "@/lib/sales/service";

/** Changes an order still to deliver; the body carries the `version` the form loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/sales/[id]">) => {
  const actor = await requirePermission("sales.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateOrder(actor, (await context.params).id, body, version));
});
