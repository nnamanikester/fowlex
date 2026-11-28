import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { incomeAhead, overview } from "./overview";
import { monthPnl, yearPnl } from "./pnl";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createExpense } from "@/lib/expenses/service";
import { createHouse } from "@/lib/houses/service";
import { aging } from "@/lib/statements/service";
import { ContractModel } from "@/models/contract";
import { CustomerModel } from "@/models/customer";
import { ExpenseModel } from "@/models/expense";
import { InvoiceModel } from "@/models/invoice";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-28";

async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const farmId = new Types.ObjectId(owner.farmId);
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  await createBatch(
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
  const spend = (date: string, amountKobo: number) =>
    createExpense(
      owner,
      { date, category: "rent", description: "Rent", amountKobo, payeeName: "", method: "cash" },
      {},
      TODAY,
    );
  await spend("2026-10-05", 3_000_000);
  await spend("2026-11-05", 5_000_000);
  // One waiting for an owner.
  const waiting = await spend("2026-11-06", 100);
  await ExpenseModel.updateOne(
    { _id: waiting.expense?.id ?? (waiting as { id?: string }).id },
    { $set: { approval: "pending" } },
  );

  const customerId = (await CustomerModel.collection.insertOne({ farmId, name: "Suya Spot", deletedAt: null }))
    .insertedId;
  const invoice = (fields: Record<string, unknown>) =>
    InvoiceModel.collection.insertOne({
      farmId,
      customerId,
      orderIds: [],
      discountKobo: 0,
      vatKobo: 0,
      paidKobo: 0,
      state: "sent",
      deletedAt: null,
      ...fields,
    });
  // October's ₦600,000 is overdue with ₦100,000 paid; November's ₦250,000 isn't due yet.
  await invoice({
    number: "INV-1",
    issueDate: "2026-10-10",
    dueDate: "2026-10-24",
    subtotalKobo: 60_000_000,
    totalKobo: 60_000_000,
    paidKobo: 10_000_000,
  });
  await invoice({
    number: "INV-2",
    issueDate: "2026-11-20",
    dueDate: "2026-12-04",
    subtotalKobo: 25_000_000,
    totalKobo: 25_000_000,
  });
  // A contract ending within the month, and one ending later.
  const contract = (number: string, endDate: string) =>
    ContractModel.collection.insertOne({
      farmId,
      customerId,
      number,
      status: "active",
      startDate: "2026-06-01",
      endDate,
      deletedAt: null,
    });
  const ending = (await contract("CON-1", "2026-12-15")).insertedId;
  await contract("CON-2", "2027-03-01");
  return { owner, ending };
}

describe("the Overview", () => {
  it("shows the reports' own numbers, and what needs attention", async () => {
    const { owner, ending } = await farm();
    const data = await overview(owner.farmId, TODAY);

    // The plan's check: every number matches the report it comes from.
    const month = await monthPnl(owner.farmId, "2026-11", "accrual", TODAY);
    const year = await yearPnl(owner.farmId, 2026, "accrual", TODAY);
    expect(data.month).toMatchObject({
      month: "2026-11",
      incomeKobo: month.incomeKobo,
      costKobo: month.costKobo,
      profitKobo: month.profitKobo,
      marginPct: month.marginPct,
    });
    expect(data.year).toMatchObject({
      year: 2026,
      incomeKobo: year.incomeKobo,
      costKobo: year.costKobo,
      profitKobo: year.profitKobo,
    });
    expect(data.owedKobo).toBe((await aging(owner.farmId, TODAY)).totalKobo);
    expect(data.month).toMatchObject({ incomeKobo: 25_000_000, costKobo: 5_000_000 });
    expect(data.year).toMatchObject({ incomeKobo: 85_000_000, costKobo: 8_000_000 });
    expect(data.owedKobo).toBe(75_000_000);
    expect(data.overdue).toEqual({ count: 1, kobo: 50_000_000 });

    // Six months of trend, the last two with income.
    expect(data.trend.map((t) => t.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(data.trend.slice(-2)).toEqual([
      { month: "2026-10", incomeKobo: 60_000_000, costKobo: 3_000_000 },
      { month: "2026-11", incomeKobo: 25_000_000, costKobo: 5_000_000 },
    ]);
    expect(data.paystackKobo).toBeNull();
    expect(data.alerts).toEqual([
      { kind: "overdue", title: "1 invoice overdue", detail: expect.any(String), href: "/invoices" },
      {
        kind: "contract",
        title: "Suya Spot's contract ends on 2026-12-15",
        detail: expect.any(String),
        href: `/contracts/${String(ending)}`,
      },
      { kind: "approval", title: "1 expense waiting for approval", detail: expect.any(String), href: "/expenses" },
    ]);
  });

  it("is calm for a new farm", async () => {
    const data = await overview(String(oid()), TODAY);
    expect(data).toMatchObject({ owedKobo: 0, overdue: { count: 0, kobo: 0 }, alerts: [] });
    expect(data.month).toMatchObject({ incomeKobo: 0, profitKobo: 0, marginPct: null });
  });
});

describe("income ahead", () => {
  const months = [
    { month: "2026-08", incomeKobo: 100 },
    { month: "2026-09", incomeKobo: 300 },
    { month: "2026-10", incomeKobo: 200 },
    { month: "2026-11", incomeKobo: 50 },
  ];

  it("carries on from the average of the last three whole months, between their lowest and highest", () => {
    expect(incomeAhead(months, "2026-11-28")).toEqual([
      { month: "2026-08", actualKobo: 100, forecastKobo: null, lowKobo: null, highKobo: null },
      { month: "2026-09", actualKobo: 300, forecastKobo: null, lowKobo: null, highKobo: null },
      { month: "2026-10", actualKobo: 200, forecastKobo: null, lowKobo: null, highKobo: null },
      // The line joins where history ends.
      { month: "2026-11", actualKobo: 50, forecastKobo: 50, lowKobo: 50, highKobo: 50 },
      { month: "2026-12", actualKobo: null, forecastKobo: 200, lowKobo: 100, highKobo: 300 },
      { month: "2027-01", actualKobo: null, forecastKobo: 200, lowKobo: 100, highKobo: 300 },
    ]);
  });

  it("forecasts nothing without a whole month behind it", () => {
    expect(incomeAhead([{ month: "2026-11", incomeKobo: 50 }], "2026-11-28")).toEqual([
      { month: "2026-11", actualKobo: 50, forecastKobo: null, lowKobo: null, highKobo: null },
    ]);
  });
});
