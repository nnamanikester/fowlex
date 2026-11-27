import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deliverOrder } from "@/lib/sales/service";

/** The birds are handed over, as counted and weighed; they leave their batches. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/sales/[id]/deliver">) => {
  const actor = await requirePermission("sales.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await deliverOrder(actor, (await context.params).id, body, version));
});
