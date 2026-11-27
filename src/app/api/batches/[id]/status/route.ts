import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { setBatchStatus } from "@/lib/batches/service";

/** Starts selling a batch, or puts it back to growing. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/batches/[id]/status">) => {
  const actor = await requirePermission("batch.write");
  const { status } = (await request.json().catch(() => ({}))) as { status?: unknown };
  return NextResponse.json(await setBatchStatus(actor, (await context.params).id, status));
});
