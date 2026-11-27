import { NextResponse } from "next/server";

import { apiRoute, requireSession } from "@/lib/auth/guard";
import { collectByTransfer } from "@/lib/collections/service";
import { portalInvoice } from "@/lib/portal/service";

/** Pay now: a bank account for the customer's own invoice. */
export const POST = apiRoute(async (_request: Request, context: RouteContext<"/api/portal/invoices/[id]/collect">) => {
  const user = await requireSession();
  const { id } = await context.params;
  await portalInvoice(user, id);
  return NextResponse.json(await collectByTransfer(user.farmId, id, user.id), { status: 201 });
});
