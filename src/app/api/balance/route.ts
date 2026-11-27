import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { balanceSummary, listEntries } from "@/lib/balance/service";

/** The Paystack balance as Paystack and Fowlex see it, and every movement in it. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("finance.read");
  const [summary, entries] = await Promise.all([balanceSummary(actor.farmId), listEntries(actor.farmId)]);
  return NextResponse.json({ summary, entries });
});
