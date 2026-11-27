import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createTemplate, listTemplates } from "@/lib/contracts/service";

/** Terms kept to start contracts from. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("contract.read");
  return NextResponse.json(await listTemplates(actor.farmId));
});

export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("contract.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createTemplate(actor, body), { status: 201 });
});
