import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createEmployee, listEmployees } from "@/lib/people/service";

/** The farm's people. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("people.read");
  return NextResponse.json(await listEmployees(actor.farmId));
});

/** Adds someone who works on the farm. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("people.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createEmployee(actor, body), { status: 201 });
});
