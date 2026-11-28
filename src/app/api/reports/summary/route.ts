import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { today } from "@/lib/dates";
import { monthPnl } from "@/lib/finance/pnl";

/** This month's profit and loss so far, as invoiced: the headline numbers. */
export const GET = apiRoute(async () => {
  const user = await requirePermission("finance.read");
  const day = today();
  const month = await monthPnl(user.farmId, day.slice(0, 7), "accrual", day);
  return NextResponse.json({
    farmId: user.farmId,
    month: month.month,
    revenueKobo: month.incomeKobo,
    expensesKobo: month.costKobo,
    profitKobo: month.profitKobo,
    marginPct: month.marginPct,
  });
});
