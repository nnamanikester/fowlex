import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { setEmployeeStatus } from "@/lib/people/service";

/** Someone leaves (`status: "left"`, `leftOn`), or comes back (`status: "active"`). */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/employees/[id]/status">) => {
  const actor = await requirePermission("people.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await setEmployeeStatus(actor, (await context.params).id, body));
});
