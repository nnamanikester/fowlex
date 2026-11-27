import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { sendInvoice } from "@/lib/invoices/service";

/** Emails the invoice PDF to the customer. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/invoices/[id]/send">) => {
  const actor = await requirePermission("invoice.write");
  return NextResponse.json(await sendInvoice(actor, (await context.params).id, new URL(request.url).origin));
});
