import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { approveExpense } from "@/lib/expenses/service";

/** An owner approves an expense waiting for approval. */
export const POST = apiRoute(async (_request: Request, context: RouteContext<"/api/expenses/[id]/approve">) => {
  const actor = await requirePermission("expense.approve");
  return NextResponse.json(await approveExpense(actor, (await context.params).id));
});
