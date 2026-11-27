import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { resendPayslip } from "@/lib/payroll/payslips";

/** Emails someone their payslip (again): `{ lineId }`. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/payroll/[id]/payslips/email">) => {
  const actor = await requirePermission("people.write");
  const { lineId } = (await request.json().catch(() => ({}))) as { lineId?: unknown };
  return NextResponse.json(await resendPayslip(actor.farmId, (await context.params).id, String(lineId ?? "")));
});
