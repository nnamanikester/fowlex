import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { adjustLine } from "@/lib/payroll/service";

/** One person's bonus, deduction, or leaving them out; the body carries the run's `version`. */
export const PATCH = apiRoute(
  async (request: Request, context: RouteContext<"/api/payroll/[id]/lines/[employeeId]">) => {
    const actor = await requirePermission("people.write");
    const { id, employeeId } = await context.params;
    const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(await adjustLine(actor, id, employeeId, body, version));
  },
);
