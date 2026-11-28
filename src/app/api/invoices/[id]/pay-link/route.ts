import { NextResponse } from "next/server";

import { apiRoute, requireAnyPermission } from "@/lib/auth/guard";
import { payLinkToken } from "@/lib/collections/service";

/** The invoice's pay link, to send the customer: they pay by card, bank app, USSD or transfer. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/invoices/[id]/pay-link">) => {
  const actor = await requireAnyPermission("invoice.write", "payment.write");
  const token = await payLinkToken(actor.farmId, (await context.params).id);
  return NextResponse.json({ url: `${new URL(request.url).origin}/pay/${token}` });
});
