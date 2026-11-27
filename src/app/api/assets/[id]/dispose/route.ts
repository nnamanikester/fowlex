import { NextResponse } from "next/server";

import { disposeAsset } from "@/lib/assets/service";
import { apiRoute, requirePermission } from "@/lib/auth/guard";

/** Records equipment sold or scrapped (`status`, `disposedOn`, `proceedsKobo`). */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/assets/[id]/dispose">) => {
  const actor = await requirePermission("expense.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await disposeAsset(actor, (await context.params).id, body));
});
