import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createLog, listLogs } from "@/lib/logs/service";

/** A batch's logs, or one day's (`?batchId=…&date=YYYY-MM-DD`). */
export const GET = apiRoute(async (request: Request) => {
  const actor = await requirePermission("batch.read");
  const url = new URL(request.url);
  const logs = await listLogs(actor.farmId, url.searchParams.get("batchId") ?? "");
  const date = url.searchParams.get("date");
  return NextResponse.json(date ? logs.filter((l) => l.date === date) : logs);
});

/** Records a batch's day. A resent log (same `requestId`) returns the saved one with 200. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("log.write");
  const { requestId, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { log, created } = await createLog(actor, body, {
    requestId: typeof requestId === "string" ? requestId : undefined,
  });
  return NextResponse.json(log, { status: created ? 201 : 200 });
});
