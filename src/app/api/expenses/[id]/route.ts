import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteExpense, updateExpense } from "@/lib/expenses/service";

/** Changes an expense's notes, receipt, batch or payee name; carries the `version` loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/expenses/[id]">) => {
  const actor = await requirePermission("expense.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateExpense(actor, (await context.params).id, body, version));
});

/** Removes an expense and the stock it brought in. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/expenses/[id]">) => {
  const actor = await requirePermission("expense.write");
  await deleteExpense(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
