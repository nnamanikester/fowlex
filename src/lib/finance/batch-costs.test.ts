import { describe, expect, it } from "vitest";

import { costSheets, kindOf, perUnit } from "./batch-costs";
import type { CurrentUser } from "@/lib/auth/current-user";
import { batchCosts } from "@/lib/batches/costs";
import { createBatch } from "@/lib/batches/service";
import { createExpense } from "@/lib/expenses/service";
import { createHouse } from "@/lib/houses/service";
import { createItem } from "@/lib/inventory/items";
import { recordMovement } from "@/lib/inventory/movements";
import { createLog } from "@/lib/logs/service";
import { ExpenseModel } from "@/models/expense";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-28";

/**
 * The worked example. Batch A: 1,000 chicks at ₦850 (₦850,000), 4 bags of feed bought at ₦18,000
 * and 2 vials of vaccine at ₦4,500 used from stock (₦72,000 + ₦9,000), a ₦60,000 labour bill
 * and ₦15,000 of transport for it. Not counted: a rejected ₦50,000 expense, a ₦600,000 generator
 * (equipment: spread over its life), and ₦100,000 of rent (shared: 8.2). Batch B, beside it: 500
 * chicks (₦425,000) and 2 bags of feed (₦36,000). Bags bought for A count when used: only their
 * ₦5,000 delivery counts when bought.
 */
async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const place = async (delivered: number) =>
    (
      await createBatch(
        owner,
        {
          houseId: house.id,
          placedOn: "2026-11-01",
          breed: "Ross 308",
          delivered,
          pricePerChickKobo: 85_000,
          targetSellAgeDays: 42,
          targetWeightGrams: 2200,
        },
        { confirm: true },
        TODAY,
      )
    ).batch;
  const a = await place(1000);
  const b = await place(500);
  const feed = await createItem(owner, { name: "Starter", category: "feed", unit: "bag", unitKg: 25 });
  await recordMovement(
    owner,
    { itemId: feed.id, type: "opening", quantity: 50, unitCostKobo: 1_800_000, date: "2026-10-31" },
    TODAY,
  );
  const vaccine = await createItem(owner, { name: "Gumboro", category: "vaccine", unit: "vial" });
  await recordMovement(
    owner,
    { itemId: vaccine.id, type: "opening", quantity: 10, unitCostKobo: 450_000, date: "2026-10-31" },
    TODAY,
  );
  await createLog(
    owner,
    {
      batchId: a.id,
      date: "2026-11-10",
      feedKg: 100,
      feedItemId: feed.id,
      supplies: [{ itemId: vaccine.id, quantity: 2 }],
    },
    {},
    TODAY,
  );
  await createLog(owner, { batchId: b.id, date: "2026-11-10", feedKg: 50, feedItemId: feed.id }, {}, TODAY);
  const spend = (over: Record<string, unknown>) =>
    createExpense(owner, { date: "2026-11-15", payeeName: "", method: "cash", ...over }, {}, TODAY);
  await spend({ category: "labour", description: "Catchers", amountKobo: 6_000_000, batchId: a.id });
  await spend({ category: "transport", description: "Feed haulage", amountKobo: 1_500_000, batchId: a.id });
  await spend({ category: "rent", description: "House rent", amountKobo: 10_000_000 });
  // 10 more bags bought for it at the same ₦18,000, with ₦5,000 delivery: the bags count as
  // they're used, so only the delivery is a cost now.
  await spend({
    category: "feed",
    description: "",
    batchId: a.id,
    lines: [{ itemId: feed.id, quantity: 10, unitCostKobo: 1_800_000 }],
    deliveryKobo: 500_000,
  });
  // Recorded as an asset (spread over its life), not a cost of this batch.
  const generator = await spend({
    category: "equipment",
    description: "Generator",
    amountKobo: 60_000_000,
    batchId: a.id,
  });
  await ExpenseModel.updateOne(
    { _id: generator.expense?.id ?? (generator as { id?: string }).id },
    { $set: { capital: true } },
  );
  const wrong = await spend({ category: "other", description: "Wrong", amountKobo: 5_000_000, batchId: a.id });
  await ExpenseModel.updateOne(
    { _id: wrong.expense?.id ?? (wrong as { id?: string }).id },
    { $set: { approval: "rejected" } },
  );
  return { owner, a, b };
}

describe("a batch's costs", () => {
  it("add up by kind to the kobo, for many batches at once", async () => {
    const { owner, a, b } = await farm();
    const sheets = await costSheets(owner.farmId, [a.id, b.id, a.id, "nope"]);
    expect(sheets.get(a.id)).toEqual({
      byKind: { chicks: 85_000_000, feed: 7_700_000, medication: 900_000, labour: 6_000_000, other: 1_500_000 },
      expensesKobo: 85_000_000 + 500_000 + 6_000_000 + 1_500_000,
      stockKobo: 7_200_000 + 900_000,
      totalKobo: 101_100_000,
    });
    expect(sheets.get(b.id)).toMatchObject({
      byKind: { chicks: 42_500_000, feed: 3_600_000, medication: 0, labour: 0, other: 0 },
      totalKobo: 46_100_000,
    });
    expect(sheets.size).toBe(2);
    // The batch page shows the same breakdown.
    const page = await batchCosts(owner.farmId, a.id);
    expect(page).toMatchObject({ totalKobo: 101_100_000, byKind: sheets.get(a.id)!.byKind });
    expect(await costSheets(owner.farmId, [])).toEqual(new Map());
  });

  it("works out per bird and per kg, and sorts categories into kinds", () => {
    expect(perUnit({ totalKobo: 100_600_000 }, { placed: 1000, survivors: 980, weightGrams: 2000 })).toEqual({
      perBirdPlacedKobo: 100_600,
      perSurvivorKobo: 102_653,
      perKgKobo: 51_327,
    });
    expect(perUnit({ totalKobo: 1 }, { placed: 0, survivors: 0, weightGrams: null })).toEqual({
      perBirdPlacedKobo: null,
      perSurvivorKobo: null,
      perKgKobo: null,
    });
    expect(["chicks", "feed", "labour", "medication", "vaccine", "rent", "litter"].map(kindOf)).toEqual([
      "chicks",
      "feed",
      "labour",
      "medication",
      "medication",
      "other",
      "other",
    ]);
  });
});
