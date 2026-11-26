import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";

/** Profit and loss headline numbers. A stub until step 8.3 fills it; guarded like the real thing. */
export const GET = apiRoute(async () => {
  const user = await requirePermission("finance.read");
  return NextResponse.json({ farmId: user.farmId, revenueKobo: 0, expensesKobo: 0, profitKobo: 0 });
});
