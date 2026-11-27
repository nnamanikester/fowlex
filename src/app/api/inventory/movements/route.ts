import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { recordMovement } from "@/lib/inventory/movements";

/** Records opening stock, usage or a count by hand. A count that matches records nothing (204). */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("inventory.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const movement = await recordMovement(actor, body);
  return movement ? NextResponse.json(movement, { status: 201 }) : new Response(null, { status: 204 });
});
