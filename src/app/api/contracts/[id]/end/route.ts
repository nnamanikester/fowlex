import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { endContract } from "@/lib/contracts/service";

/** Ends a running contract early (`on`, today if left out). */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/contracts/[id]/end">) => {
  const actor = await requirePermission("contract.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await endContract(actor, (await context.params).id, body.on));
});
