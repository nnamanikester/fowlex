import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { checkCollection } from "@/lib/collections/service";

/** Has the money come into the transfer account? Checked with Paystack, and recorded when it has. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/collections/[id]">) => {
  const actor = await requirePermission("invoice.read");
  return NextResponse.json(await checkCollection(actor.farmId, (await context.params).id));
});
