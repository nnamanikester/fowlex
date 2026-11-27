import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createExpense, listExpenses } from "@/lib/expenses/service";

/** The farm's expenses (`?supplierId=` for one supplier's). */
export const GET = apiRoute(async (request: Request) => {
  const actor = await requirePermission("expense.read");
  const supplierId = new URL(request.url).searchParams.get("supplierId") ?? undefined;
  return NextResponse.json(await listExpenses(actor.farmId, { supplierId }));
});

/** Records an expense or a purchase of stock. A resent one (same `requestId`) returns 200. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("expense.write");
  const { requestId, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { expense, created } = await createExpense(actor, body, {
    requestId: typeof requestId === "string" ? requestId : undefined,
  });
  return NextResponse.json(expense, { status: created ? 201 : 200 });
});
