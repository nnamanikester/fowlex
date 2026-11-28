import "server-only";

import { balanceSummary } from "@/lib/balance/service";
import { addDays } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { pendingApprovals } from "@/lib/expenses/service";
import { aging } from "@/lib/statements/service";
import { monthsBetween } from "./overhead";
import { type MonthPnl, monthPnl, type Pnl, yearPnl } from "./pnl";
import { ContractModel } from "@/models/contract";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";

export type ForecastPoint = {
  month: string;
  actualKobo: number | null;
  forecastKobo: number | null;
  lowKobo: number | null;
  highKobo: number | null;
};

/**
 * Income for the months ahead, from the last three whole months: their average, with the likely
 * range running from the lowest to the highest of them. The month in progress carries on to its end
 * at its pace so far. A plain guide until the forecasts in phase 9.
 */
export function incomeAhead(
  months: Pick<MonthPnl, "month" | "incomeKobo">[],
  today: string,
  ahead = 2,
): ForecastPoint[] {
  const current = today.slice(0, 7);
  const done = months.filter((m) => m.month < current).slice(-3);
  const points: ForecastPoint[] = months.map((m) => ({
    month: m.month,
    actualKobo: m.incomeKobo,
    forecastKobo: null,
    lowKobo: null,
    highKobo: null,
  }));
  if (!done.length) return points;
  const values = done.map((m) => m.incomeKobo);
  const average = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const low = Math.min(...values);
  const high = Math.max(...values);
  // The line joins where history ends.
  const last = points.at(-1)!;
  last.forecastKobo = last.actualKobo;
  last.lowKobo = last.actualKobo;
  last.highKobo = last.actualKobo;
  const next = monthsBetween(`${addMonths(current, 1)}-01`, `${addMonths(current, ahead)}-01`);
  for (const month of next)
    points.push({ month, actualKobo: null, forecastKobo: average, lowKobo: low, highKobo: high });
  return points;
}

const addMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};

export type Alert = { kind: "overdue" | "contract" | "approval"; title: string; detail: string; href: string };

export type Overview = {
  month: Pnl & { month: string };
  year: Pnl & { year: number };
  /** The last six months, for the trend. */
  trend: { month: string; incomeKobo: number; costKobo: number }[];
  forecast: ForecastPoint[];
  owedKobo: number;
  overdue: { count: number; kobo: number };
  /** What the farm's Paystack balance holds, by Fowlex's book; null when Paystack isn't set up. */
  paystackKobo: number | null;
  alerts: Alert[];
};

/** Everything the Overview shows, from the same sums the reports use, so the numbers always agree. */
export async function overview(farmId: string, today: string): Promise<Overview> {
  await connectDb();
  const current = today.slice(0, 7);
  const sixAgo = addMonths(current, -5);
  const [year, trendMonths, owed, overdueRows, balance, approvals, ending] = await Promise.all([
    yearPnl(farmId, Number(today.slice(0, 4)), "accrual", today),
    Promise.all(monthsBetween(`${sixAgo}-01`, today).map((m) => monthPnl(farmId, m, "accrual", today))),
    aging(farmId, today),
    InvoiceModel.find(
      { farmId, state: "sent", dueDate: { $lt: today }, $expr: { $gt: ["$totalKobo", "$paidKobo"] } },
      { totalKobo: 1, paidKobo: 1 },
    ).lean(),
    balanceSummary(farmId),
    pendingApprovals(farmId),
    ContractModel.find(
      { farmId, status: "active", endDate: { $gte: today, $lte: addDays(today, 30) } },
      { customerId: 1, endDate: 1, number: 1 },
    )
      .sort({ endDate: 1 })
      .lean(),
  ]);
  const month = trendMonths.at(-1)!;
  const overdue = { count: overdueRows.length, kobo: overdueRows.reduce((n, i) => n + i.totalKobo - i.paidKobo, 0) };
  const names = new Map(
    (
      await CustomerModel.find({ farmId, _id: { $in: ending.map((c) => c.customerId) } }, { name: 1 })
        .setOptions({ withDeleted: true })
        .lean()
    ).map((c) => [String(c._id), c.name]),
  );

  const alerts: Alert[] = [];
  if (overdue.count)
    alerts.push({
      kind: "overdue",
      title: `${overdue.count} invoice${overdue.count === 1 ? "" : "s"} overdue`,
      detail: "Past their due date and not yet paid in full.",
      href: "/invoices",
    });
  for (const c of ending)
    alerts.push({
      kind: "contract",
      title: `${names.get(String(c.customerId)) ?? "A customer"}'s contract ends ${c.endDate === today ? "today" : `on ${c.endDate}`}`,
      detail: "Renew it or let it end.",
      href: `/contracts/${String(c._id)}`,
    });
  if (approvals)
    alerts.push({
      kind: "approval",
      title: `${approvals} expense${approvals === 1 ? "" : "s"} waiting for approval`,
      detail: "Above the approval limit: an owner decides.",
      href: "/expenses",
    });

  return {
    month: { month: month.month, ...pick(month) },
    year: { year: year.year, ...pick(year) },
    trend: trendMonths.map((m) => ({ month: m.month, incomeKobo: m.incomeKobo, costKobo: m.costKobo })),
    forecast: incomeAhead(trendMonths, today),
    owedKobo: owed.totalKobo,
    overdue,
    paystackKobo: balance.mode === "off" ? null : balance.fowlexKobo,
    alerts,
  };
}

const pick = (p: Pnl): Pnl => ({
  incomeKobo: p.incomeKobo,
  directKobo: p.directKobo,
  sharedKobo: p.sharedKobo,
  costKobo: p.costKobo,
  profitKobo: p.profitKobo,
  marginPct: p.marginPct,
});
