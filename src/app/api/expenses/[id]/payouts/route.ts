import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { listPayouts } from "@/lib/payouts/service";

/** An expense's Paystack transfers, newest first. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/expenses/[id]/payouts">) => {
  const actor = await requirePermission("expense.read");
  return NextResponse.json(await listPayouts(actor.farmId, (await context.params).id));
});
