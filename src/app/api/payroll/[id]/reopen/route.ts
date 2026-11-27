import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { reopenRun } from "@/lib/payroll/service";

/** Takes approved pay back to a draft, before anyone's paid. Owners only. */
export const POST = apiRoute(async (_request: Request, context: RouteContext<"/api/payroll/[id]/reopen">) => {
  const actor = await requirePermission("payroll.run");
  return NextResponse.json(await reopenRun(actor, (await context.params).id));
});
