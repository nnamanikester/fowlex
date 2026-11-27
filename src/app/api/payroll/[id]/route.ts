import { NextResponse } from "next/server";

import { apiRoute, HttpError, requirePermission } from "@/lib/auth/guard";
import { deleteRun, getRun } from "@/lib/payroll/service";

/** One month's pay, worked out afresh while it's a draft. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/payroll/[id]">) => {
  const actor = await requirePermission("payroll.read");
  const run = await getRun(actor.farmId, (await context.params).id);
  if (!run) throw new HttpError(404, "not_found", "That payroll run doesn't exist any more.");
  return NextResponse.json(run);
});

/** Removes a month's pay that isn't approved yet. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/payroll/[id]">) => {
  const actor = await requirePermission("people.write");
  await deleteRun(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
