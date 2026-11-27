import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { markPaid } from "@/lib/expenses/service";

/** Records that an owed expense was paid outside Fowlex (`method`, `paidOn`). */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/expenses/[id]/paid">) => {
  const actor = await requirePermission("expense.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await markPaid(actor, (await context.params).id, body));
});
