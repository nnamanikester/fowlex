import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createHealthEvent, listHealth } from "@/lib/health/service";

/** A batch's health record (`?batchId=…`). */
export const GET = apiRoute(async (request: Request) => {
  const actor = await requirePermission("batch.read");
  return NextResponse.json(await listHealth(actor.farmId, new URL(request.url).searchParams.get("batchId") ?? ""));
});

/** Records a vaccination, medication or vet visit. A resent one (same `requestId`) returns 200. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("log.write");
  const { requestId, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { event, created } = await createHealthEvent(actor, body, {
    requestId: typeof requestId === "string" ? requestId : undefined,
  });
  return NextResponse.json(event, { status: created ? 201 : 200 });
});
