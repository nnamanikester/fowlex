import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { cancelOrder } from "@/lib/sales/service";

/** Calls off an order still to deliver. */
export const POST = apiRoute(async (_request: Request, context: RouteContext<"/api/sales/[id]/cancel">) => {
  const actor = await requirePermission("sales.write");
  return NextResponse.json(await cancelOrder(actor, (await context.params).id));
});
