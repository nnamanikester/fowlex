import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { payRun } from "@/lib/payroll/service";

/** Sends everyone's pay still owed through Paystack. Owners only. */
export const POST = apiRoute(async (_request: Request, context: RouteContext<"/api/payroll/[id]/pay">) => {
  const actor = await requirePermission("payout.send");
  return NextResponse.json(await payRun(actor, (await context.params).id));
});
