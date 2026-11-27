import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { inviteCustomer } from "@/lib/customers/service";

/** Emails the customer a link to set up their portal login. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/customers/[id]/invite">) => {
  const actor = await requirePermission("customer.write");
  return NextResponse.json(await inviteCustomer(actor, (await context.params).id, new URL(request.url).origin));
});
