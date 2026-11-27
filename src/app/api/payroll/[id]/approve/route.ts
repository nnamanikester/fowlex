import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { approveRun } from "@/lib/payroll/service";

/** Approves a month's pay into payslips, each with its expense to pay. Owners only. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/payroll/[id]/approve">) => {
  const actor = await requirePermission("payroll.run");
  const { version } = (await request.json().catch(() => ({}))) as { version?: unknown };
  return NextResponse.json(await approveRun(actor, (await context.params).id, version));
});
