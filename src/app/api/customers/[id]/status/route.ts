import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { setCustomerStatus } from "@/lib/customers/service";

/** Archives a customer, or brings one back. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/customers/[id]/status">) => {
  const actor = await requirePermission("customer.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await setCustomerStatus(actor, (await context.params).id, body.status));
});
