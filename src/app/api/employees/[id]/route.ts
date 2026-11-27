import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteEmployee, updateEmployee } from "@/lib/people/service";

/** Saves someone's details; the body carries the `version` the form loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/employees/[id]">) => {
  const actor = await requirePermission("people.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateEmployee(actor, (await context.params).id, body, version));
});

/** Removes someone added by mistake. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/employees/[id]">) => {
  const actor = await requirePermission("people.write");
  await deleteEmployee(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
