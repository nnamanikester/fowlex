import { Types } from "mongoose";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { buildReport, readOptions } from "./build";
import { reportCsv, reportPdf } from "./export";
import { csvCell, csvHeader, monthLabel, showCell } from "./table";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createExpense } from "@/lib/expenses/service";
import { createHouse } from "@/lib/houses/service";
import { CustomerModel } from "@/models/customer";
import { ExpenseModel } from "@/models/expense";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";
import { PayrollRunModel } from "@/models/payroll-run";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-28";
const options = (over: Partial<Parameters<typeof buildReport>[2]> = {}) => ({
  year: 2026,
  basis: "accrual" as const,
  by: "month" as const,
  today: TODAY,
  ...over,
});

/**
 * A small farm's year. One batch from 1 October. Spending: October rent ₦30,000 (paid 5 Oct),
 * November feed ₦200,000 (paid 10 Nov) and transport ₦15,000 (unpaid), and a rejected ₦99.
 * Sales: Suya Spot ₦300,000 invoiced 20 Oct and paid ₦100,000 on 2 Nov; Grill House ₦120,000
 * invoiced 15 Nov, due 22 Nov, unpaid. Payroll: October's run, two people.
 */
async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const farmId = new Types.ObjectId(owner.farmId);
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const { batch } = await createBatch(
    owner,
    {
      houseId: house.id,
      placedOn: "2026-10-01",
      breed: "Ross 308",
      delivered: 1000,
      pricePerChickKobo: 0,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
    },
    { confirm: true },
    TODAY,
  );
  const spend = async (date: string, category: string, amountKobo: number, paidOn: string | null) => {
    const made = await createExpense(
      owner,
      { date, category, description: category, amountKobo, payeeName: "", method: "cash" },
      {},
      TODAY,
    );
    const id = made.expense?.id ?? (made as { id?: string }).id;
    await ExpenseModel.updateOne({ _id: id }, { $set: { paymentStatus: paidOn ? "paid" : "unpaid", paidOn } });
    return id;
  };
  await spend("2026-10-05", "rent", 3_000_000, "2026-10-05");
  await spend("2026-11-10", "feed", 20_000_000, "2026-11-10");
  await spend("2026-11-12", "transport", 1_500_000, null);
  const rejected = await spend("2026-11-13", "other", 99, null);
  await ExpenseModel.updateOne({ _id: rejected }, { $set: { approval: "rejected" } });

  const customer = async (name: string) =>
    (await CustomerModel.collection.insertOne({ farmId, name, deletedAt: null })).insertedId;
  const suya = await customer("Suya Spot");
  const grill = await customer("Grill House");
  const invoice = async (customerId: Types.ObjectId, issueDate: string, dueDate: string, totalKobo: number) =>
    (
      await InvoiceModel.collection.insertOne({
        farmId,
        customerId,
        number: `INV-${issueDate}`,
        orderIds: [],
        issueDate,
        dueDate,
        subtotalKobo: totalKobo,
        discountKobo: 0,
        vatKobo: 0,
        totalKobo,
        paidKobo: 0,
        state: "sent",
        deletedAt: null,
      })
    ).insertedId;
  const first = await invoice(suya, "2026-10-20", "2026-11-03", 30_000_000);
  await invoice(grill, "2026-11-15", "2026-11-22", 12_000_000);
  await InvoiceModel.updateOne({ _id: first }, { $set: { paidKobo: 10_000_000 } });
  await PaymentModel.collection.insertOne({
    farmId,
    customerId: suya,
    invoiceId: first,
    date: "2026-11-02",
    amountKobo: 10_000_000,
    method: "transfer",
    deletedAt: null,
  });
  const line = (name: string, grossKobo: number, bonusKobo: number, deductionKobo: number, advanceKobo: number) => ({
    employeeId: new Types.ObjectId(),
    name,
    payType: "monthly",
    rateKobo: grossKobo,
    units: 1,
    grossKobo,
    bonusKobo,
    deductionKobo,
    advanceKobo,
    netKobo: grossKobo + bonusKobo - deductionKobo - advanceKobo,
    excluded: false,
  });
  await PayrollRunModel.collection.insertOne({
    farmId,
    number: "PAY-1",
    period: "2026-10",
    status: "approved",
    lines: [
      line("Musa", 8_000_000, 500_000, 0, 1_000_000),
      line("Ngozi", 6_000_000, 0, 200_000, 0),
      { ...line("Left", 1, 0, 0, 0), excluded: true },
    ],
    deletedAt: null,
  });
  // A draft run doesn't count.
  await PayrollRunModel.collection.insertOne({
    farmId,
    number: "PAY-2",
    period: "2026-11",
    status: "draft",
    lines: [line("Musa", 8_000_000, 0, 0, 0)],
    deletedAt: null,
  });
  return { owner, batch };
}

describe("the reports", () => {
  it("cash flow: money in by payment day, money out by the day it was paid", async () => {
    const { owner } = await farm();
    const r = await buildReport(owner.farmId, "cashflow", options());
    expect(r.rows.slice(-2)).toEqual([
      ["2026-10", 0, 3_000_000, -3_000_000, -3_000_000],
      ["2026-11", 10_000_000, 20_000_000, -10_000_000, -13_000_000],
    ]);
    expect(r.rows).toHaveLength(11);
    expect(r.total).toEqual(["Total", 10_000_000, 23_000_000, -13_000_000, null]);
  });

  it("expenses by category: approved spending, biggest first, with its share", async () => {
    const { owner } = await farm();
    const r = await buildReport(owner.farmId, "expenses", options());
    expect(r.rows).toEqual([
      ["Feed", 1, 20_000_000, 81.6],
      ["Rent", 1, 3_000_000, 12.2],
      ["Transport", 1, 1_500_000, 6.1],
    ]);
    expect(r.total).toEqual(["Total", 3, 24_500_000, 100]);
  });

  it("sales by customer: invoiced, paid in the year, and owed now", async () => {
    const { owner } = await farm();
    const r = await buildReport(owner.farmId, "sales", options());
    expect(r.rows).toEqual([
      ["Suya Spot", 1, 30_000_000, 10_000_000, 20_000_000],
      ["Grill House", 1, 12_000_000, 0, 12_000_000],
    ]);
    expect(r.total).toEqual(["Total", 2, 42_000_000, 10_000_000, 32_000_000]);
  });

  it("who owes what: by how late, as of today", async () => {
    const { owner } = await farm();
    const r = await buildReport(owner.farmId, "aging", options());
    expect(r.period).toBe("As of 28 Nov 2026");
    expect(r.columns.map((c) => c.header)).toEqual([
      "Customer",
      "Up to 30 days",
      "31 to 60 days",
      "61 to 90 days",
      "Over 90 days",
      "Total",
    ]);
    expect(r.total).toEqual(["Total", 32_000_000, 0, 0, 0, 32_000_000]);
  });

  it("payroll: approved runs only, without anyone left out", async () => {
    const { owner } = await farm();
    const r = await buildReport(owner.farmId, "payroll", options());
    expect(r.rows).toEqual([["2026-10", 2, 14_000_000, 500_000, 200_000, 1_000_000, 13_300_000]]);
    expect(r.total).toEqual(["Total", null, 14_000_000, 500_000, 200_000, 1_000_000, 13_300_000]);
  });

  it("profit and loss: by month, by quarter (the sum of its months) and by batch", async () => {
    const { owner, batch } = await farm();
    const months = await buildReport(owner.farmId, "profit", options());
    const quarters = await buildReport(owner.farmId, "profit", options({ by: "quarter" }));
    expect(months.rows).toHaveLength(11);
    expect(quarters.rows.map((r) => r[0])).toEqual(["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"]);
    // Q4 is October and November.
    const q4 = quarters.rows[3];
    expect(q4[1]).toBe((months.rows[9][1] as number) + (months.rows[10][1] as number));
    expect(quarters.total).toEqual(months.total);
    expect(months.total).toEqual(["Total", 42_000_000, 0, 24_500_000, 17_500_000, 41.7]);
    const batches = await buildReport(owner.farmId, "profit", options({ by: "batch", basis: "cash" }));
    expect(batches).toMatchObject({ period: "All batches, cash received", filename: "fowlex-profit-by-batch-cash" });
    expect(batches.rows).toEqual([[batch.code, "2026-10-01", 0, 0, 24_500_000, -24_500_000, null, 24_500, null]]);
  });
});

describe("exports", () => {
  it("a CSV opens in Excel with naira amounts as numbers and ISO dates", async () => {
    const { owner } = await farm();
    const csv = reportCsv(await buildReport(owner.farmId, "cashflow", options()));
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe('"Month","Money in (NGN)","Money out (NGN)","Net (NGN)","Net so far (NGN)"');
    expect(lines).toContain('"2026-11",100000,200000,-100000,-130000');
    expect(lines.at(-1)).toBe('"Total",100000,230000,-130000,');
    const batches = reportCsv(await buildReport(owner.farmId, "profit", options({ by: "batch" })));
    expect(batches).toContain(',"2026-10-01",0,0,245000,-245000,,245,');
  });

  it("a PDF has every row, a header on every page, and the totals", async () => {
    const r = {
      kind: "sales",
      title: "Sales by customer",
      period: "2026",
      columns: [
        { header: "Customer", kind: "text" as const },
        { header: "Invoiced", kind: "money" as const },
      ],
      rows: Array.from({ length: 70 }, (_, i) => [`Customer ${i}`, i * 100_000]),
      total: ["Total", 241_500_000],
      filename: "x",
      note: "A note.",
    };
    const doc = await PDFDocument.load(await reportPdf(r, "Fowlex Farms"));
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toBe("Sales by customer 2026");
    // Wide reports go landscape; an empty one says so.
    const wide = await PDFDocument.load(
      await reportPdf(
        {
          ...r,
          columns: Array.from({ length: 7 }, (_, i) => ({ header: `C${i}`, kind: "money" as const })),
          rows: [],
          total: null,
        },
        "",
      ),
    );
    const [w, h] = [wide.getPage(0).getWidth(), wide.getPage(0).getHeight()];
    expect(w).toBeGreaterThan(h);
  });

  it("shows cells for people and spreadsheets", () => {
    expect(monthLabel("2026-11")).toBe("Nov 2026");
    const naira = (k: number) => `N${k / 100}`;
    expect(showCell("2026-11-05", "date", naira)).toBe("5 Nov 2026");
    expect(showCell("2026-11", "month", naira)).toBe("Nov 2026");
    expect(showCell(150_000, "money", naira)).toBe("N1500");
    expect(showCell(12.5, "percent", naira)).toBe("12.5%");
    expect(showCell(1234, "number", naira)).toBe("1,234");
    expect(showCell(null, "money", naira)).toBe("–");
    expect(showCell("Q1", "text", naira)).toBe("Q1");
    expect(showCell("Total", "month", naira)).toBe("Total");
    expect(showCell("Total", "date", naira)).toBe("Total");
    expect(csvCell(150_050, "money")).toBe(1500.5);
    expect(csvCell(12.5, "percent")).toBe(12.5);
    expect(csvCell(null, "money")).toBeNull();
    expect(csvCell("2026-11-05", "date")).toBe("2026-11-05");
    expect(csvHeader({ header: "Spent", kind: "money" })).toBe("Spent (NGN)");
    expect(csvHeader({ header: "Share", kind: "percent" })).toBe("Share (%)");
    expect(csvHeader({ header: "Month", kind: "month" })).toBe("Month");
  });

  it("reads its options from the address, with defaults", () => {
    const read = (q: string) => readOptions(new URLSearchParams(q), TODAY);
    expect(read("")).toEqual({ year: 2026, basis: "accrual", by: "month", today: TODAY });
    expect(read("year=2025&basis=cash&by=batch")).toEqual({ year: 2025, basis: "cash", by: "batch", today: TODAY });
    expect(read("year=2099&by=week")).toMatchObject({ year: 2026, by: "month" });
  });
});
