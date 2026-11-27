import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { closeBatch } from "@/lib/batches/service";

/** Closes a batch once every bird is accounted for; carries `closedOn` and the `version` loaded. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/batches/[id]/close">) => {
  const actor = await requirePermission("batch.write");
  const body = (await request.json().catch(() => ({}))) as { closedOn?: unknown; version?: unknown };
  return NextResponse.json(await closeBatch(actor, (await context.params).id, body));
});
