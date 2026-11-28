import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteContract, updateContract } from "@/lib/contracts/service";

/** Changes a draft or running contract; the body carries the `version` the form loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/contracts/[id]">) => {
  const actor = await requirePermission("contract.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(
    await updateContract(actor, (await context.params).id, body, version, undefined, new URL(request.url).origin),
  );
});

/** Removes a draft written by mistake. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/contracts/[id]">) => {
  const actor = await requirePermission("contract.write");
  await deleteContract(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
