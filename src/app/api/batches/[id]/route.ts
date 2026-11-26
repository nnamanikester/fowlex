import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteBatch, updateBatch } from "@/lib/batches/service";

/** Saves a batch. Carries the `version` the form loaded; `confirm` accepts placement warnings. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/batches/[id]">) => {
  const actor = await requirePermission("batch.write");
  const { version, confirm, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(
    await updateBatch(actor, (await context.params).id, body, { version, confirm: confirm === true }),
  );
});

export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/batches/[id]">) => {
  const actor = await requirePermission("batch.write");
  await deleteBatch(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
