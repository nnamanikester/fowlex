import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { voidInvoice } from "@/lib/invoices/service";

/** Voids an invoice made in error (`reason`); its number is kept and its orders freed. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/invoices/[id]/void">) => {
  const actor = await requirePermission("invoice.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await voidInvoice(actor, (await context.params).id, body.reason));
});
