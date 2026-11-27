import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { statementFor } from "@/lib/statements/service";

/** A customer's statement (`?from=…&to=…`): opening balance, invoices and payments, closing balance. */
export const GET = apiRoute(async (request: Request, context: RouteContext<"/api/customers/[id]/statement">) => {
  const actor = await requirePermission("invoice.read");
  const params = new URL(request.url).searchParams;
  return NextResponse.json(
    await statementFor(actor.farmId, (await context.params).id, {
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    }),
  );
});
