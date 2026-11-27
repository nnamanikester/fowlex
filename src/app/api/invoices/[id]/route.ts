import { NextResponse } from "next/server";

import { apiRoute, HttpError, requirePermission } from "@/lib/auth/guard";
import { getInvoice, updateInvoice } from "@/lib/invoices/service";

export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/invoices/[id]">) => {
  const actor = await requirePermission("invoice.read");
  const invoice = await getInvoice(actor.farmId, (await context.params).id);
  if (!invoice) throw new HttpError(404, "not_found", "That invoice isn't here any more.");
  return NextResponse.json(invoice);
});

/** Changes a draft's discount, due date or notes; the body carries the `version` the form loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/invoices/[id]">) => {
  const actor = await requirePermission("invoice.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateInvoice(actor, (await context.params).id, body, version));
});
