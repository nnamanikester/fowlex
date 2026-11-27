import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { updateRecurring } from "@/lib/recurring/service";

/** Changes a repeat's amount or day, or stops or restarts it. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/recurring/[id]">) => {
  const actor = await requirePermission("expense.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateRecurring(actor, (await context.params).id, body));
});
