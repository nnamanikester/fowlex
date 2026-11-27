import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { balanceSummary, syncBalance } from "@/lib/balance/service";

/** Checks with Paystack now: opens the book the first time, then reads its ledger from where it stopped. */
export const POST = apiRoute(async () => {
  const actor = await requirePermission("finance.read");
  const result = await syncBalance(actor.farmId);
  return NextResponse.json({ ...result, summary: await balanceSummary(actor.farmId) });
});
