import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { recordBatchChicks } from "@/lib/batches/service";

/** Records the chicks of a batch placed before Fowlex recorded them itself (`paidBy`). */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/batches/[id]/chicks">) => {
  const actor = await requirePermission("expense.write");
  const { paidBy } = (await request.json().catch(() => ({}))) as { paidBy?: unknown };
  return NextResponse.json(await recordBatchChicks(actor, (await context.params).id, paidBy), { status: 201 });
});
