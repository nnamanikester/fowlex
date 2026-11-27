import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { aging } from "@/lib/statements/service";

/** What every customer owes, by how late it is. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("invoice.read");
  return NextResponse.json(await aging(actor.farmId));
});
