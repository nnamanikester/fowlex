import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { pickUpBatch } from "@/lib/batches/service";

/** Booked chicks picked up and placed: what turned up, the house and the day. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/batches/[id]/pickup">) => {
  const actor = await requirePermission("batch.write");
  const { version, confirm, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(
    await pickUpBatch(actor, (await context.params).id, body, { version, confirm: confirm === true }),
  );
});
