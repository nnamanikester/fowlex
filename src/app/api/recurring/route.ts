import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { listRecurring } from "@/lib/recurring/service";

/** The farm's monthly repeats. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("expense.read");
  return NextResponse.json(await listRecurring(actor.farmId));
});
