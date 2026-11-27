import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { updateCategory } from "@/lib/expenses/categories-service";

/** Renames, budgets or archives a category. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/expense-categories/[key]">) => {
  const actor = await requirePermission("settings.manage");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateCategory(actor, (await context.params).key, body));
});
