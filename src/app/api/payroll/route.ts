import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { listRuns, startRun } from "@/lib/payroll/service";

/** The farm's payroll runs. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("payroll.read");
  return NextResponse.json(await listRuns(actor.farmId));
});

/** Starts working out a month's pay (`period`, this month if left out). */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("people.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await startRun(actor, body), { status: 201 });
});
