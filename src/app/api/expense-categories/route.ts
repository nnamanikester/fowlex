import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createCategory, listCategories } from "@/lib/expenses/categories-service";

/** The farm's expense categories, with budgets. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("expense.read");
  return NextResponse.json(await listCategories(actor.farmId));
});

/** Adds a category of the farm's own. Owners: budgets are their call. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("settings.manage");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createCategory(actor, body), { status: 201 });
});
