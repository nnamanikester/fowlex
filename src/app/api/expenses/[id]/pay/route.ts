import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { payExpense, payPreview } from "@/lib/payouts/service";

/** Who would be paid, and whether the Paystack balance covers it. Owners only. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/expenses/[id]/pay">) => {
  const actor = await requirePermission("payout.send");
  return NextResponse.json(await payPreview(actor, (await context.params).id));
});

/** Sends the money through Paystack. Owners only; a second tap while one is on its way is refused. */
export const POST = apiRoute(async (_request: Request, context: RouteContext<"/api/expenses/[id]/pay">) => {
  const actor = await requirePermission("payout.send");
  return NextResponse.json(await payExpense(actor, (await context.params).id), { status: 201 });
});
