import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { reopenBatch } from "@/lib/batches/service";

/** Reopens a batch closed by mistake. */
export const POST = apiRoute(async (_request: Request, context: RouteContext<"/api/batches/[id]/reopen">) => {
  const actor = await requirePermission("batch.write");
  return NextResponse.json(await reopenBatch(actor, (await context.params).id));
});
