import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { addPnl, batchesPnl, income, monthPnl, pnl, yearPnl } from "./pnl";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createExpense } from "@/lib/expenses/service";
import { createHouse } from "@/lib/houses/service";
import { BatchModel } from "@/models/batch";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";
import { SalesOrderModel } from "@/models/sales-order";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-12-10";

/**
 * The worked example. Batch A: 1,000 birds from 1 October; batch B: 500 from 1 November.
 *
 * Sales. INV-1 (20 Oct): 100 of A's birds at ₦7,000, ₦700,000. INV-2 (15 Nov): 50 of A's at ₦7,000
 * (₦350,000), 40 kg of B's at ₦3,200 (₦128,000) and ₦10,000 delivery, less 10%: ₦439,200 (A ₦315,000,
 * B ₦115,200, delivery ₦9,000). Not income: an unpaid draft and a voided invoice. Paid: half of INV-1
 * on 5 Nov, half of INV-2 on 2 Dec.
 *
 * Costs. October: A's labour ₦10,000 and rent ₦30,000 (only A on the farm: all A's). November: A's
 * labour ₦20,000 and rent ₦50,000, shared 30,000 : 15,000 bird-days, ₦33,333.33 and ₦16,666.67.
 */
async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const farmId = new Types.ObjectId(owner.farmId);
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const place = async (placedOn: string, delivered: number) =>
    (
      await createBatch(
        owner,
        {
          houseId: house.id,
          placedOn,
          breed: "Ross 308",
          delivered,
          pricePerChickKobo: 0,
          targetSellAgeDays: 42,
          targetWeightGrams: 2200,
        },
        { confirm: true },
        TODAY,
      )
    ).batch;
  const a = await place("2026-10-01", 1000);
  const b = await place("2026-11-01", 500);
  const spend = (date: string, category: string, amountKobo: number, batchId?: string) =>
    createExpense(
      owner,
      { date, category, description: category, amountKobo, batchId, payeeName: "", method: "cash" },
      {},
      TODAY,
    );
  await spend("2026-10-15", "labour", 1_000_000, a.id);
  await spend("2026-10-05", "rent", 3_000_000);
  await spend("2026-11-10", "labour", 2_000_000, a.id);
  await spend("2026-11-05", "rent", 5_000_000);

  const customerId = new Types.ObjectId();
  const order = async (lines: Record<string, unknown>[], deliveryKobo = 0) =>
    (
      await SalesOrderModel.collection.insertOne({
        farmId,
        customerId,
        number: `SO-${Math.random()}`,
        status: "pending",
        deliveryDate: "2026-12-30",
        lines,
        deliveryKobo,
      })
    ).insertedId;
  const line = (batchId: string, birds: number, priceKobo: number, pricing = "perBird", weightGrams = 0) => ({
    batchId: new Types.ObjectId(batchId),
    birds,
    priceKobo,
    pricing,
    weightGrams,
  });
  const invoice = async (fields: Record<string, unknown>) =>
    (
      await InvoiceModel.collection.insertOne({
        farmId,
        customerId,
        number: `INV-${Math.random()}`,
        discountKobo: 0,
        vatKobo: 0,
        paidKobo: 0,
        state: "sent",
        dueDate: "2026-12-31",
        deletedAt: null,
        ...fields,
      })
    ).insertedId;
  const o1 = await order([line(a.id, 100, 700_000)]);
  const o2 = await order([line(a.id, 50, 700_000), line(b.id, 20, 320_000, "perKg", 40_000)], 1_000_000);
  const i1 = await invoice({
    orderIds: [o1],
    issueDate: "2026-10-20",
    subtotalKobo: 70_000_000,
    totalKobo: 70_000_000,
  });
  const i2 = await invoice({
    orderIds: [o2],
    issueDate: "2026-11-15",
    subtotalKobo: 48_800_000,
    discountKobo: 4_880_000,
    totalKobo: 43_920_000,
  });
  // Neither is income: a draft nobody has paid, and a voided invoice.
  await invoice({
    orderIds: [o1],
    issueDate: "2026-11-20",
    subtotalKobo: 9_900_000,
    totalKobo: 9_900_000,
    state: "draft",
  });
  const voided = await invoice({
    orderIds: [o1],
    issueDate: "2026-11-21",
    subtotalKobo: 8_800_000,
    totalKobo: 8_800_000,
    state: "void",
  });
  const pay = (invoiceId: Types.ObjectId, date: string, amountKobo: number) =>
    PaymentModel.collection.insertOne({
      farmId,
      customerId,
      invoiceId,
      date,
      amountKobo,
      method: "cash",
      deletedAt: null,
    });
  await pay(i1, "2026-11-05", 35_000_000);
  await pay(i2, "2026-12-02", 21_960_000);
  await pay(voided, "2026-12-03", 100);
  return { owner, a, b };
}

describe("profit and loss", () => {
  it("counts invoiced income by batch, less discounts, delivery fees to no batch", async () => {
    const { owner, a, b } = await farm();
    const nov = await income(owner.farmId, { from: "2026-11-01", to: "2026-11-30" }, "accrual");
    expect(nov.totalKobo).toBe(43_920_000);
    expect(Object.fromEntries(nov.byBatch)).toEqual({ [a.id]: 31_500_000, [b.id]: 11_520_000 });
    expect(nov.unbatchedKobo).toBe(900_000);
    // On cash: what came in, split the same way.
    const dec = await income(owner.farmId, { from: "2026-12-01", to: "2026-12-31" }, "cash");
    expect(dec).toMatchObject({ totalKobo: 21_960_000, unbatchedKobo: 450_000 });
    expect(Object.fromEntries(dec.byBatch)).toEqual({ [a.id]: 15_750_000, [b.id]: 5_760_000 });
  });

  it("adds each month up from its batches and what belongs to none", async () => {
    const { owner, a, b } = await farm();
    const nov = await monthPnl(owner.farmId, "2026-11", "accrual", TODAY);
    expect(nov.batches).toEqual([
      { batchId: a.id, code: a.code, ...pnl(31_500_000, 2_000_000, 3_333_333) },
      { batchId: b.id, code: b.code, ...pnl(11_520_000, 0, 1_666_667) },
    ]);
    expect(nov.unbatched).toEqual(pnl(900_000, 0, 0));
    expect(nov).toMatchObject({ incomeKobo: 43_920_000, costKobo: 7_000_000, profitKobo: 36_920_000, marginPct: 84.1 });
    // The plan's check: the month is the sum of its batches and what wasn't shared out.
    expect(addPnl([...nov.batches, nov.unbatched])).toEqual(addPnl([nov]));

    const oct = await monthPnl(owner.farmId, "2026-10", "accrual", TODAY);
    expect(oct.batches).toEqual([{ batchId: a.id, code: a.code, ...pnl(70_000_000, 1_000_000, 3_000_000) }]);
  });

  it("adds the year up from its months, invoiced or as cash came in", async () => {
    const { owner } = await farm();
    for (const basis of ["accrual", "cash"] as const) {
      const year = await yearPnl(owner.farmId, 2026, basis, TODAY);
      expect(year.months.map((m) => m.month)).toHaveLength(12);
      expect(addPnl(year.months)).toEqual(addPnl([year]));
      expect(year.costKobo).toBe(11_000_000);
    }
    expect(await yearPnl(owner.farmId, 2026, "accrual", TODAY)).toMatchObject({
      incomeKobo: 113_920_000,
      profitKobo: 102_920_000,
    });
    expect(await yearPnl(owner.farmId, 2026, "cash", TODAY)).toMatchObject({
      incomeKobo: 56_960_000,
      profitKobo: 45_960_000,
    });
    expect(await yearPnl(owner.farmId, 2027, "cash", TODAY)).toMatchObject({
      months: [],
      incomeKobo: 0,
      marginPct: null,
    });
  });

  it("gives each batch's whole-life profit, cost per bird and per kg", async () => {
    const { owner, a, b } = await farm();
    const rows = await batchesPnl(owner.farmId, "accrual", TODAY);
    expect(rows.map((r) => r.code)).toEqual([b.code, a.code]);
    const [rowB, rowA] = rows;
    // December's shares are nothing: nothing shared was spent.
    expect(rowA).toMatchObject({
      ...pnl(101_500_000, 3_000_000, 6_333_333),
      placed: 1000,
      liveBirds: 1000,
      perBirdKobo: 9_333,
      perKgKobo: null,
    });
    expect(rowB).toMatchObject({ ...pnl(11_520_000, 0, 1_666_667), perBirdKobo: 3_333 });
    expect(await batchesPnl(String(oid()), "cash", TODAY)).toEqual([]);
  });

  it("keeps sales of a closed batch, and batches with no sales, in their months", async () => {
    const owner: CurrentUser = {
      id: String(oid()),
      farmId: String(oid()),
      name: "Ada",
      email: "a@f.com",
      role: "owner",
    };
    const farmId = new Types.ObjectId(owner.farmId);
    const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
    const make = (placedOn: string) =>
      createBatch(
        owner,
        {
          houseId: house.id,
          placedOn,
          breed: "Ross 308",
          delivered: 100,
          pricePerChickKobo: 0,
          targetSellAgeDays: 42,
          targetWeightGrams: 2200,
        },
        { confirm: true },
        TODAY,
      ).then((r) => r.batch);
    // Placed last year: made recently, then moved back (a new batch can't be that old).
    const old = await make("2026-01-01");
    const quiet = await make("2026-10-01");
    await BatchModel.updateOne(
      { _id: old.id },
      { $set: { placedOn: "2025-09-01", status: "closed", closedOn: "2025-09-30" } },
    );
    const orderId = (
      await SalesOrderModel.collection.insertOne({
        farmId,
        status: "invoiced",
        deliveryDate: "2025-09-30",
        // One line from the closed batch, one typed with no batch.
        lines: [
          { batchId: new Types.ObjectId(old.id), birds: 10, priceKobo: 100_000, pricing: "perBird", weightGrams: 0 },
          { batchId: null, birds: 1, priceKobo: 50_000, pricing: "perBird", weightGrams: 0 },
        ],
      })
    ).insertedId;
    // Invoiced after it closed, with 7.5% VAT, and an order that's since gone.
    await InvoiceModel.collection.insertOne({
      farmId,
      state: "sent",
      issueDate: "2025-10-05",
      orderIds: [orderId, new Types.ObjectId()],
      subtotalKobo: 1_050_000,
      discountKobo: 0,
      vatKobo: 78_750,
      totalKobo: 1_128_750,
      paidKobo: 0,
      deletedAt: null,
    });
    const oct = await monthPnl(owner.farmId, "2025-10", "accrual", TODAY);
    expect(oct.batches).toEqual([{ batchId: old.id, code: old.code, ...pnl(1_000_000, 0, 0) }]);
    expect(oct.unbatched).toEqual(pnl(50_000, 0, 0));
    const year = await yearPnl(owner.farmId, 2025, "accrual", TODAY);
    expect(year).toMatchObject({ incomeKobo: 1_050_000, costKobo: 0 });
    expect(year.months).toHaveLength(12);
    const rows = await batchesPnl(owner.farmId, "accrual", TODAY);
    expect(rows.find((r) => r.batchId === quiet.id)).toMatchObject({ incomeKobo: 0, costKobo: 0, marginPct: null });
    expect(rows.find((r) => r.batchId === old.id)).toMatchObject({ incomeKobo: 1_000_000, closedOn: "2025-09-30" });
  });
});
