import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { collectByTransfer } from "@/lib/collections/service";

/** A bank account the customer can transfer what's left on the invoice into. */
export const POST = apiRoute(async (_request: Request, context: RouteContext<"/api/invoices/[id]/collect">) => {
  const actor = await requirePermission("payment.write");
  return NextResponse.json(await collectByTransfer(actor.farmId, (await context.params).id, actor.id), { status: 201 });
});
