import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createBatch } from "@/lib/batches/service";

/**
 * Places a new batch. `confirm` goes ahead despite warnings (over capacity, resting house…);
 * `requestId` makes a retried submission return the batch it already created (200, not 201).
 */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("batch.write");
  const { confirm, requestId, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { batch, created } = await createBatch(actor, body, {
    confirm: confirm === true,
    requestId: typeof requestId === "string" ? requestId : undefined,
  });
  return NextResponse.json(batch, { status: created ? 201 : 200 });
});
