import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { decideChange } from "@/lib/contracts/service";

/** An owner approves a change to an agreed contract (`approve: true`) or turns it down with a `note`. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/contracts/changes/[id]">) => {
  const actor = await requirePermission("contract.approve");
  const body = (await request.json().catch(() => ({}))) as { approve?: unknown; note?: unknown };
  return NextResponse.json(await decideChange(actor, (await context.params).id, body));
});
