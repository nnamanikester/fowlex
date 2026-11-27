import { describe, expect, it } from "vitest";

import { createItem, deleteItem, listItems } from "./items";
import { deleteMovement, listMovements, recordMovement, stockLevels } from "./movements";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createHouse } from "@/lib/houses/service";
import { createLog, deleteLog, updateLog } from "@/lib/logs/service";
import { BatchModel } from "@/models/batch";
import { StockMovementModel } from "@/models/stock-movement";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-26";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

async function farm() {
  const actor: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const feed = await createItem(actor, {
    name: "Starter feed",
    category: "feed",
    unit: "bag",
    unitKg: 25,
    reorderLevel: 10,
  });
  const house = await createHouse(actor, { name: "House 1", capacity: 5000 });
  const { batch } = await createBatch(
    actor,
    {
      houseId: house.id,
      placedOn: "2026-11-02",
      breed: "Ross 308",
      delivered: 1000,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
    },
    {},
    TODAY,
  );
  return { actor, feed, batch };
}

describe("stock by hand", () => {
  it("values 25 bags at ₦18,500 after 20 at ₦18,000 and 10 at ₦19,500 come in and 5 are used", async () => {
    const { actor, feed, batch } = await farm();
    await recordMovement(
      actor,
      { itemId: feed.id, type: "opening", quantity: 20, unitCostKobo: 1_800_000, date: "2026-11-01" },
      TODAY,
    );
    await recordMovement(
      actor,
      { itemId: feed.id, type: "opening", quantity: 10, unitCostKobo: 1_950_000, date: "2026-11-03" },
      TODAY,
    );
    const used = await recordMovement(
      actor,
      { itemId: feed.id, type: "usage", quantity: 5, batchId: batch.id, date: "2026-11-05" },
      TODAY,
    );
    expect(used).toMatchObject({ quantity: -5, batchId: batch.id, source: null });
    expect((await stockLevels(actor.farmId)).get(feed.id)).toEqual({
      onHand: 25,
      valueKobo: 46_250_000,
      avgCostKobo: 1_850_000,
    });
    const [item] = await listItems(actor.farmId);
    expect(item).toMatchObject({ onHand: 25, low: false, valueKobo: 46_250_000 });
    const history = await listMovements(actor.farmId, feed.id);
    expect(history.map((m) => [m.type, m.balance])).toEqual([
      ["usage", 25],
      ["opening", 30],
      ["opening", 20],
    ]);
    expect(await listMovements(actor.farmId, "nope")).toEqual([]);
  });

  it("records a count as the difference, nothing when it matches, and flags low stock", async () => {
    const { actor, feed } = await farm();
    await recordMovement(actor, { itemId: feed.id, type: "opening", quantity: 20, unitCostKobo: 1_800_000 }, TODAY);
    const counted = await recordMovement(actor, { itemId: feed.id, type: "count", counted: 8 }, TODAY);
    expect(counted).toMatchObject({ type: "adjustment", quantity: -12, notes: "Counted 8 bags", date: TODAY });
    expect(await recordMovement(actor, { itemId: feed.id, type: "count", counted: 8 }, TODAY)).toBeNull();
    expect((await listItems(actor.farmId))[0]).toMatchObject({ onHand: 8, low: true });
  });

  it.each([
    [{ type: "opening", quantity: 0, unitCostKobo: 100 }, "quantity"],
    [{ type: "opening", quantity: 5 }, "unitCostKobo"],
    [{ type: "opening", quantity: 5, unitCostKobo: 1.5 }, "unitCostKobo"],
    [{ type: "usage", quantity: -1 }, "quantity"],
    [{ type: "usage", quantity: 1, batchId: "nope" }, "batchId"],
    [{ type: "count", counted: -1 }, "counted"],
    [{ type: "count" }, "counted"],
    [{ type: "gift", quantity: 1 }, "type"],
    [{ type: "usage", quantity: 1, date: "2026-11-27" }, "date"],
    [{ type: "usage", quantity: 1, date: "soon" }, "date"],
  ])("refuses %j", async (input, field) => {
    const { actor, feed } = await farm();
    expect(await refusal(recordMovement(actor, { itemId: feed.id, ...input }, TODAY))).toMatchObject({
      status: 400,
      field,
    });
  });

  it("refuses another farm's item and usage charged to a closed batch", async () => {
    const { actor, feed, batch } = await farm();
    const other = await farm();
    expect(
      await refusal(recordMovement(actor, { itemId: other.feed.id, type: "usage", quantity: 1 }, TODAY)),
    ).toMatchObject({
      field: "itemId",
    });
    await BatchModel.updateOne({ _id: batch.id }, { status: "closed", closedOn: TODAY });
    expect(
      await refusal(recordMovement(actor, { itemId: feed.id, type: "usage", quantity: 1, batchId: batch.id }, TODAY)),
    ).toMatchObject({ code: "closed" });
  });

  it("deletes a record made by hand, and keeps an item with history (archive it instead)", async () => {
    const { actor, feed } = await farm();
    const m = await recordMovement(actor, { itemId: feed.id, type: "opening", quantity: 3, unitCostKobo: 100 }, TODAY);
    expect(await refusal(deleteItem(actor, feed.id))).toMatchObject({ status: 409, code: "has_history" });
    await deleteMovement(actor, m!.id);
    expect((await stockLevels(actor.farmId)).get(feed.id)).toBeUndefined();
    expect(await refusal(deleteMovement(actor, m!.id))).toMatchObject({ status: 404 });
    await deleteItem(actor, feed.id);
  });
});

describe("feed from the daily log", () => {
  it("takes the kg logged off the chosen feed, charged to the batch, and follows edits and deletes", async () => {
    const { actor, feed, batch } = await farm();
    await recordMovement(
      actor,
      { itemId: feed.id, type: "opening", quantity: 20, unitCostKobo: 1_800_000, date: "2026-11-02" },
      TODAY,
    );
    const { log } = await createLog(
      actor,
      { batchId: batch.id, date: TODAY, feedKg: 87.5, feedItemId: feed.id },
      {},
      TODAY,
    );
    expect(log).toMatchObject({ feedItemId: feed.id, feedType: "Starter feed" });
    const usage = () => StockMovementModel.find({ farmId: actor.farmId, "source.id": log.id }).lean();
    expect(await usage()).toMatchObject([
      { type: "usage", quantity: -3.5, date: TODAY, source: { kind: "daily-log" } },
    ]);
    expect(String((await usage())[0].batchId)).toBe(batch.id);

    const edited = await updateLog(
      actor,
      log.id,
      { date: "2026-11-25", feedKg: 50, feedItemId: feed.id },
      log.version,
      TODAY,
    );
    expect(await usage()).toMatchObject([{ quantity: -2, date: "2026-11-25" }]);

    // A different feed moves the usage to it.
    const grower = await createItem(actor, { name: "Grower feed", category: "feed", unit: "kg" });
    const moved = await updateLog(
      actor,
      log.id,
      { date: "2026-11-25", feedKg: 50, feedItemId: grower.id },
      edited.version,
      TODAY,
    );
    expect((await usage()).map((m) => [String(m.itemId), m.quantity])).toEqual([[grower.id, -50]]);
    // And the deleted feed movement can't be removed by hand.
    const fromLog = (await usage())[0];
    expect(await refusal(deleteMovement(actor, String(fromLog._id)))).toMatchObject({ code: "has_source" });

    // No feed, no usage.
    await updateLog(actor, log.id, { date: "2026-11-25", feedKg: 0, feedItemId: grower.id }, moved.version, TODAY);
    expect(await usage()).toEqual([]);
    await updateLog(actor, log.id, { date: "2026-11-25", feedKg: 10, feedItemId: grower.id }, moved.version + 1, TODAY);
    expect(await usage()).toHaveLength(1);
    await deleteLog(actor, log.id);
    expect(await usage()).toEqual([]);
    expect((await stockLevels(actor.farmId)).get(feed.id)?.onHand).toBe(20);
  });

  it("only takes feed from a feed item on the farm, and keeps logs without one", async () => {
    const { actor, batch } = await farm();
    const diesel = await createItem(actor, { name: "Diesel", category: "fuel", unit: "litre" });
    expect(
      await refusal(createLog(actor, { batchId: batch.id, date: TODAY, feedKg: 10, feedItemId: diesel.id }, {}, TODAY)),
    ).toMatchObject({ field: "feedItemId" });
    expect(
      await refusal(createLog(actor, { batchId: batch.id, date: TODAY, feedKg: 10, feedItemId: "nope" }, {}, TODAY)),
    ).toMatchObject({ field: "feedItemId" });
    const { log } = await createLog(
      actor,
      { batchId: batch.id, date: TODAY, feedKg: 10, feedType: "Starter" },
      {},
      TODAY,
    );
    expect(log.feedItemId).toBeNull();
    expect(await StockMovementModel.countDocuments({ farmId: actor.farmId })).toBe(0);
  });
});
