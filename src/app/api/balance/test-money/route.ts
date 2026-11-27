import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { addTestMoney, balanceSummary } from "@/lib/balance/service";

/** Play money into the simulator's balance, booked as funding. Owners only; never live. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("payout.send");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await addTestMoney(actor, body.amountKobo);
  return NextResponse.json({ ...result, summary: await balanceSummary(actor.farmId) }, { status: 201 });
});
