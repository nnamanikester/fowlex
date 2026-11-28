import "server-only";

import { Types } from "mongoose";

import { formatRange } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { listCategories } from "@/lib/expenses/categories-service";
import { categoryName } from "@/lib/expenses/categories";
import { monthsBetween } from "@/lib/finance/overhead";
import { addPnl, type Basis, batchesPnl, type Pnl, yearPnl } from "@/lib/finance/pnl";
import { aging } from "@/lib/statements/service";
import { AGING_BANDS, AGING_LABELS } from "@/lib/statements/rules";
import { CustomerModel } from "@/models/customer";
import { ExpenseModel } from "@/models/expense";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";
import { PayrollRunModel } from "@/models/payroll-run";
import { type Cell, PROFIT_BY, type ProfitBy, type ReportKind, type ReportTable } from "./table";

export { PROFIT_BY, type ProfitBy, REPORT_LABELS, REPORTS, type ReportKind } from "./table";

export type ReportOptions = { year: number; basis: Basis; by: ProfitBy; today: string };

const pnlCells = (p: Pnl): Cell[] => [p.incomeKobo, p.directKobo, p.sharedKobo, p.profitKobo, p.marginPct];
const PNL_COLUMNS = [
  { header: "Income", kind: "money" },
  { header: "Direct costs", kind: "money" },
  { header: "Shared costs", kind: "money" },
  { header: "Net profit", kind: "money" },
  { header: "Margin", kind: "percent" },
] as const;
const sum = (rows: Cell[][], i: number) => rows.reduce((n, r) => n + ((r[i] as number) ?? 0), 0);
const range = (year: number, today: string) => ({
  from: `${year}-01-01`,
  to: `${year}-12-31` < today ? `${year}-12-31` : today,
});

/** One report, ready for the page, a CSV or a PDF. */
export async function buildReport(farmId: string, kind: ReportKind, o: ReportOptions): Promise<ReportTable> {
  await connectDb();
  switch (kind) {
    case "profit":
      return profit(farmId, o);
    case "cashflow":
      return cashflow(farmId, o);
    case "expenses":
      return expenses(farmId, o);
    case "sales":
      return sales(farmId, o);
    case "aging":
      return whoOwes(farmId, o);
    case "payroll":
      return payroll(farmId, o);
  }
}

/** Profit and loss by month, quarter or batch. */
async function profit(farmId: string, { year, basis, by, today }: ReportOptions): Promise<ReportTable> {
  const basisWord = basis === "accrual" ? "invoiced" : "cash received";
  const note =
    "Direct costs are what each batch used; shared costs (rent, power, staff, equipment wear) are shared by bird-days. Income is net of VAT.";
  if (by === "batch") {
    const batches = await batchesPnl(farmId, basis, today);
    const total = addPnl(batches);
    return {
      kind: "profit",
      title: "Profit and loss by batch",
      period: `All batches, ${basisWord}`,
      columns: [
        { header: "Batch", kind: "text" },
        { header: "Placed", kind: "date" },
        ...PNL_COLUMNS,
        { header: "Cost a bird", kind: "money" },
        { header: "Cost a kg", kind: "money" },
      ],
      rows: batches.map((b) => [b.code, b.placedOn, ...pnlCells(b), b.perBirdKobo, b.perKgKobo]),
      total: ["Total", null, ...pnlCells(total), null, null],
      filename: `fowlex-profit-by-batch-${basis}`,
      note,
    };
  }
  const report = await yearPnl(farmId, year, basis, today);
  const groups =
    by === "month"
      ? report.months.map((m) => ({ label: m.month, p: m as Pnl }))
      : [1, 2, 3, 4]
          .map((q) => ({
            label: `Q${q} ${year}`,
            months: report.months.filter((m) => Math.ceil(Number(m.month.slice(5, 7)) / 3) === q),
          }))
          .filter((g) => g.months.length)
          .map((g) => ({ label: g.label, p: addPnl(g.months) }));
  return {
    kind: "profit",
    title: by === "month" ? "Profit and loss by month" : "Profit and loss by quarter",
    period: `${year}, ${basisWord}`,
    columns: [
      { header: by === "month" ? "Month" : "Quarter", kind: by === "month" ? "month" : "text" },
      ...PNL_COLUMNS,
    ],
    rows: groups.map((g) => [g.label, ...pnlCells(g.p)]),
    total: ["Total", ...pnlCells(report)],
    filename: `fowlex-profit-by-${by}-${year}-${basis}`,
    note,
  };
}

/** Money in (customers' payments) and out (expenses paid), by month, and the year's running net. */
async function cashflow(farmId: string, { year, today }: ReportOptions): Promise<ReportTable> {
  const r = range(year, today);
  const farm = new Types.ObjectId(farmId);
  const [ins, outs] = await Promise.all([
    PaymentModel.aggregate<{ _id: string; kobo: number }>([
      { $match: { farmId: farm, deletedAt: null, date: { $gte: r.from, $lte: r.to } } },
      { $group: { _id: { $substrCP: ["$date", 0, 7] }, kobo: { $sum: "$amountKobo" } } },
    ]),
    ExpenseModel.aggregate<{ _id: string; kobo: number }>([
      { $match: { farmId: farm, deletedAt: null, paymentStatus: "paid", paidOn: { $gte: r.from, $lte: r.to } } },
      { $group: { _id: { $substrCP: ["$paidOn", 0, 7] }, kobo: { $sum: "$amountKobo" } } },
    ]),
  ]);
  const inOf = new Map(ins.map((x) => [x._id, x.kobo]));
  const outOf = new Map(outs.map((x) => [x._id, x.kobo]));
  let running = 0;
  const rows = (r.from > r.to ? [] : monthsBetween(r.from, r.to)).map((m) => {
    const net = (inOf.get(m) ?? 0) - (outOf.get(m) ?? 0);
    running += net;
    return [m, inOf.get(m) ?? 0, outOf.get(m) ?? 0, net, running];
  });
  return {
    kind: "cashflow",
    title: "Cash flow",
    period: String(year),
    columns: [
      { header: "Month", kind: "month" },
      { header: "Money in", kind: "money" },
      { header: "Money out", kind: "money" },
      { header: "Net", kind: "money" },
      { header: "Net so far", kind: "money" },
    ],
    rows,
    total: ["Total", sum(rows, 1), sum(rows, 2), sum(rows, 3), null],
    filename: `fowlex-cash-flow-${year}`,
    note: "Money in is what customers paid; money out is every expense paid, by the day it was paid.",
  };
}

/** Approved spending in the year, by category, biggest first. */
async function expenses(farmId: string, { year, today }: ReportOptions): Promise<ReportTable> {
  const r = range(year, today);
  const [rows, categories] = await Promise.all([
    ExpenseModel.aggregate<{ _id: string; count: number; kobo: number }>([
      {
        $match: {
          farmId: new Types.ObjectId(farmId),
          deletedAt: null,
          approval: { $in: ["approved", null] },
          date: { $gte: r.from, $lte: r.to },
        },
      },
      { $group: { _id: "$category", count: { $sum: 1 }, kobo: { $sum: "$amountKobo" } } },
      { $sort: { kobo: -1, _id: 1 } },
    ]),
    listCategories(farmId),
  ]);
  const total = rows.reduce((n, x) => n + x.kobo, 0);
  const share = (kobo: number) => (total ? Math.round((kobo / total) * 1000) / 10 : null);
  return {
    kind: "expenses",
    title: "Expenses by category",
    period: String(year),
    columns: [
      { header: "Category", kind: "text" },
      { header: "Expenses", kind: "number" },
      { header: "Spent", kind: "money" },
      { header: "Share", kind: "percent" },
    ],
    rows: rows.map((x) => [categoryName(categories, x._id), x.count, x.kobo, share(x.kobo)]),
    total: ["Total", rows.reduce((n, x) => n + x.count, 0), total, total ? 100 : null],
    filename: `fowlex-expenses-by-category-${year}`,
    note: "Approved expenses by the day they were spent, equipment and stock bought included.",
  };
}

/** Each customer's year: invoiced, paid, and what they owe now. */
async function sales(farmId: string, { year, today }: ReportOptions): Promise<ReportTable> {
  const r = range(year, today);
  const farm = new Types.ObjectId(farmId);
  const [invoiced, paid, owing] = await Promise.all([
    InvoiceModel.aggregate<{ _id: Types.ObjectId; count: number; kobo: number }>([
      {
        $match: {
          farmId: farm,
          deletedAt: null,
          issueDate: { $gte: r.from, $lte: r.to },
          $or: [{ state: "sent" }, { state: "draft", paidKobo: { $gt: 0 } }],
        },
      },
      { $group: { _id: "$customerId", count: { $sum: 1 }, kobo: { $sum: "$totalKobo" } } },
    ]),
    PaymentModel.aggregate<{ _id: Types.ObjectId; kobo: number }>([
      { $match: { farmId: farm, deletedAt: null, date: { $gte: r.from, $lte: r.to } } },
      { $group: { _id: "$customerId", kobo: { $sum: "$amountKobo" } } },
    ]),
    aging(farmId, today),
  ]);
  const ids = [...new Set([...invoiced, ...paid].map((x) => String(x._id)))];
  const names = new Map(
    (
      await CustomerModel.find({ farmId, _id: { $in: ids } }, { name: 1 })
        .setOptions({ withDeleted: true })
        .lean()
    ).map((c) => [String(c._id), c.name]),
  );
  const of = <T extends { _id: Types.ObjectId }>(list: T[], id: string) => list.find((x) => String(x._id) === id);
  const rows = ids
    .map((id) => [
      names.get(id) ?? "A removed customer",
      of(invoiced, id)?.count ?? 0,
      of(invoiced, id)?.kobo ?? 0,
      of(paid, id)?.kobo ?? 0,
      owing.rows.find((x) => x.customerId === id)?.totalKobo ?? 0,
    ])
    .sort((a, b) => (b[2] as number) - (a[2] as number) || String(a[0]).localeCompare(String(b[0])));
  return {
    kind: "sales",
    title: "Sales by customer",
    period: String(year),
    columns: [
      { header: "Customer", kind: "text" },
      { header: "Invoices", kind: "number" },
      { header: "Invoiced", kind: "money" },
      { header: "Paid", kind: "money" },
      { header: "Owes now", kind: "money" },
    ],
    rows,
    total: ["Total", sum(rows, 1), sum(rows, 2), sum(rows, 3), sum(rows, 4)],
    filename: `fowlex-sales-by-customer-${year}`,
    note: "Invoiced includes VAT. Paid is what came in during the year, whichever invoice it was for.",
  };
}

/** What every customer owes today, by how late it is. */
async function whoOwes(farmId: string, { today }: ReportOptions): Promise<ReportTable> {
  const a = await aging(farmId, today);
  return {
    kind: "aging",
    title: "Who owes what",
    period: `As of ${formatRange({ from: today, to: today })}`,
    columns: [
      { header: "Customer", kind: "text" },
      ...AGING_BANDS.map((b) => ({ header: AGING_LABELS[b], kind: "money" as const })),
      { header: "Total", kind: "money" },
    ],
    rows: a.rows.map((x) => [x.name, ...AGING_BANDS.map((b) => x.bands[b]), x.totalKobo]),
    total: ["Total", ...AGING_BANDS.map((b) => a.bands[b]), a.totalKobo],
    filename: `fowlex-who-owes-what-${today}`,
    note: "What's left on every invoice not void or paid, by days past its due date.",
  };
}

/** Each approved pay run in the year: people paid, gross, bonuses, deductions, advances, net. */
async function payroll(farmId: string, { year }: ReportOptions): Promise<ReportTable> {
  const runs = await PayrollRunModel.find({ farmId, status: "approved", period: { $regex: `^${year}-` } })
    .sort({ period: 1 })
    .lean();
  const rows = runs.map((run) => {
    const lines = run.lines.filter((l) => !l.excluded);
    const add = (k: "grossKobo" | "bonusKobo" | "deductionKobo" | "advanceKobo" | "netKobo") =>
      lines.reduce((n, l) => n + l[k], 0);
    return [
      run.period,
      lines.length,
      add("grossKobo"),
      add("bonusKobo"),
      add("deductionKobo"),
      add("advanceKobo"),
      add("netKobo"),
    ];
  });
  return {
    kind: "payroll",
    title: "Payroll summary",
    period: String(year),
    columns: [
      { header: "Month", kind: "month" },
      { header: "People", kind: "number" },
      { header: "Gross", kind: "money" },
      { header: "Bonuses", kind: "money" },
      { header: "Deductions", kind: "money" },
      { header: "Advances repaid", kind: "money" },
      { header: "Net pay", kind: "money" },
    ],
    rows,
    total: ["Total", null, sum(rows, 2), sum(rows, 3), sum(rows, 4), sum(rows, 5), sum(rows, 6)],
    filename: `fowlex-payroll-${year}`,
    note: "Approved pay runs only.",
  };
}

/** A report's options from a URL (the page's or an export link's), with sensible defaults. */
export function readOptions(params: URLSearchParams, today: string): ReportOptions {
  const thisYear = Number(today.slice(0, 4));
  const year = Number(params.get("year"));
  return {
    year: Number.isInteger(year) && year >= 2000 && year <= thisYear ? year : thisYear,
    basis: params.get("basis") === "cash" ? "cash" : "accrual",
    by: PROFIT_BY.includes(params.get("by") as ProfitBy) ? (params.get("by") as ProfitBy) : "month",
    today,
  };
}
