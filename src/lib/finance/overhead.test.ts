import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { batchOverhead, birdDays, monthBounds, monthOverhead, monthsBetween, splitByBirdDays } from "./overhead";
import { createAsset } from "@/lib/assets/service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { batchCosts } from "@/lib/batches/costs";
import { createBatch } from "@/lib/batches/service";
import { createExpense } from "@/lib/expenses/service";
import { createHouse } from "@/lib/houses/service";
import { createItem } from "@/lib/inventory/items";
import { createLog } from "@/lib/logs/service";
import { BatchModel } from "@/models/batch";
import { SalesOrderModel } from "@/models/sales-order";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-12-05";

async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
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
  const spend = (over: Record<string, unknown>) =>
    createExpense(owner, { payeeName: "", method: "cash", ...over }, {}, TODAY);
  return { owner, place, spend };
}

describe("shared costs split by bird-days", () => {
  it("splits ₦400,000 of rent ₦300,000 and ₦100,000 between 30,000 and 10,000 bird-days", async () => {
    const { owner, place, spend } = await farm();
    // 1,000 birds all of November, and 1,000 from the 21st: 30,000 and 10,000 bird-days.
    const a = await place("2026-11-01", 1000);
    const b = await place("2026-11-21", 1000);
    await spend({ date: "2026-11-15", category: "rent", description: "House rent", amountKobo: 40_000_000 });
    // Charged to a batch, so not shared; and a month away, so not November's.
    await spend({
      date: "2026-11-15",
      category: "labour",
      description: "Catchers",
      amountKobo: 5_000_000,
      batchId: a.id,
    });
    await spend({ date: "2026-10-30", category: "rent", description: "October rent", amountKobo: 9_000_000 });

    const nov = await monthOverhead(owner.farmId, "2026-11", TODAY);
    expect(nov).toEqual({
      month: "2026-11",
      expensesKobo: 40_000_000,
      depreciationKobo: 0,
      totalKobo: 40_000_000,
      batches: [
        { batchId: a.id, code: a.code, birdDays: 30_000, shareKobo: 30_000_000 },
        { batchId: b.id, code: b.code, birdDays: 10_000, shareKobo: 10_000_000 },
      ],
      unsharedKobo: 0,
    });
    // October had no birds: its rent has no batch to go to.
    expect(await monthOverhead(owner.farmId, "2026-10", TODAY)).toMatchObject({
      totalKobo: 9_000_000,
      batches: [],
      unsharedKobo: 9_000_000,
    });
    // December so far: up to today, the 5th; nothing spent yet.
    expect(await monthOverhead(owner.farmId, "2026-12", TODAY)).toMatchObject({
      totalKobo: 0,
      batches: [
        { batchId: a.id, birdDays: 5000, shareKobo: 0 },
        { batchId: b.id, birdDays: 5000, shareKobo: 0 },
      ],
    });
    // The batch page counts its share in its costs.
    expect(await batchOverhead(owner.farmId, { id: a.id, placedOn: "2026-11-01", closedOn: null }, TODAY)).toEqual([
      { month: "2026-11", shareKobo: 30_000_000 },
      { month: "2026-12", shareKobo: 0 },
    ]);
    expect(await batchCosts(owner.farmId, a.id, TODAY)).toMatchObject({
      sharedKobo: 30_000_000,
      totalKobo: 35_000_000,
    });
  });

  it("counts deaths, culls, sales, deliveries, closing and equipment wear", async () => {
    const { owner, place, spend } = await farm();
    const a = await place("2026-11-01", 100);
    const b = await place("2026-11-01", 100);
    // A: 10 die on the 10th (90 from the 11th), a week's log takes 7 more over the 20th–26th.
    await createLog(owner, { batchId: a.id, date: "2026-11-10", deaths: 10 }, {}, TODAY);
    await createLog(owner, { batchId: a.id, date: "2026-11-20", endDate: "2026-11-26", culls: 7 }, {}, TODAY);
    // B: 40 delivered to a customer on the 16th, then closed on the 20th.
    await SalesOrderModel.collection.insertOne({
      farmId: new Types.ObjectId(owner.farmId),
      status: "delivered",
      deliveryDate: "2026-11-15",
      deliveredOn: "2026-11-16",
      lines: [
        { batchId: new Types.ObjectId(b.id), birds: 40 },
        { batchId: null, birds: 5 },
        { batchId: new Types.ObjectId(), birds: 3 },
      ],
    });
    await BatchModel.updateOne({ _id: b.id }, { $set: { status: "closed", closedOn: "2026-11-20" } });
    // A ₦120,000 generator over 12 months: ₦10,000 a month.
    await createAsset(
      owner,
      {
        name: "Generator",
        kind: "generator",
        costKobo: 12_000_000,
        salvageKobo: 0,
        purchasedOn: "2026-06-10",
        usefulLifeMonths: 12,
        notes: "",
      },
      TODAY,
    );
    await spend({ date: "2026-11-30", category: "utilities", description: "Power", amountKobo: 1_000 });
    // Feed bought for the store: the bags are a cost as they're used; only the ₦50 delivery is shared.
    const feed = await createItem(owner, { name: "Grower", category: "feed", unit: "bag", unitKg: 25 });
    await spend({
      date: "2026-11-30",
      category: "feed",
      description: "",
      lines: [{ itemId: feed.id, quantity: 10, unitCostKobo: 1_800_000 }],
      deliveryKobo: 5_000,
    });

    const nov = await monthOverhead(owner.farmId, "2026-11", TODAY);
    // A: 100×10 + 90×9 (11th–19th) + a cull a day from the 20th: 89, 88… 84 on the 26th's morning, then 83 to the 30th.
    const aDays = 1000 + 90 * 10 + (89 + 88 + 87 + 86 + 85 + 84) + 83 * 4;
    // B: 100×16 (1st–16th) + 60×4 (17th–20th).
    const bDays = 1600 + 240;
    expect(nov.batches.map((x) => x.birdDays)).toEqual([aDays, bDays]);
    expect(nov).toMatchObject({ expensesKobo: 6_000, depreciationKobo: 1_000_000, totalKobo: 1_006_000 });
    expect(nov.batches.reduce((n, x) => n + x.shareKobo, 0)).toBe(1_006_000);
    // A batch that lost every bird in October has no bird-days in November, so no share.
    const lost = await place("2026-10-01", 50);
    await createLog(owner, { batchId: lost.id, date: "2026-10-05", deaths: 50 }, {}, TODAY);
    expect((await monthOverhead(owner.farmId, "2026-11", TODAY)).batches.map((x) => x.batchId)).toEqual([a.id, b.id]);
    // Closed in November: nothing of December's.
    expect((await monthOverhead(owner.farmId, "2026-12", TODAY)).batches.map((x) => x.batchId)).toEqual([a.id]);
  });
});

describe("the arithmetic", () => {
  it("counts the birds alive each morning, within the batch's days", () => {
    const batch = { placedOn: "2026-11-03", closedOn: "2026-11-06", placed: 10 };
    expect(birdDays(batch, [{ date: "2026-11-04", birds: 4 }], "2026-11-01", "2026-11-30")).toBe(10 + 10 + 6 + 6);
    expect(birdDays(batch, [{ date: "2026-11-01", birds: 20 }], "2026-11-01", "2026-11-30")).toBe(0);
    expect(birdDays(batch, [], "2026-12-01", "2026-12-31")).toBe(0);
  });

  it("shares whole kobo that add up to the total", () => {
    expect([
      ...splitByBirdDays(
        100,
        new Map([
          ["a", 1],
          ["b", 1],
          ["c", 1],
        ]),
      ),
    ]).toEqual([
      ["a", 34],
      ["b", 33],
      ["c", 33],
    ]);
    expect([
      ...splitByBirdDays(
        40_000_000,
        new Map([
          ["a", 30_000],
          ["b", 10_000],
        ]),
      ),
    ]).toEqual([
      ["a", 30_000_000],
      ["b", 10_000_000],
    ]);
    expect([...splitByBirdDays(0, new Map([["a", 1]]))]).toEqual([["a", 0]]);
    expect([...splitByBirdDays(5, new Map())]).toEqual([]);
  });

  it("walks months", () => {
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthsBetween("2026-11-20", "2027-02-01")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});
