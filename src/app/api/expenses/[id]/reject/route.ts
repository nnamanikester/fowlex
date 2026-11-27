import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { rejectExpense } from "@/lib/expenses/service";

/** An owner rejects an expense waiting for approval, with a `reason`. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/expenses/[id]/reject">) => {
  const actor = await requirePermission("expense.approve");
  const { reason } = (await request.json().catch(() => ({}))) as { reason?: unknown };
  return NextResponse.json(await rejectExpense(actor, (await context.params).id, reason));
});
