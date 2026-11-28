import { describe, expect, it } from "vitest";

import { validateLog } from "./rules";
import { createLog, deleteLog, updateLog } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { listHealth } from "@/lib/health/service";
import { createHouse } from "@/lib/houses/service";
import { createItem } from "@/lib/inventory/items";
import { recordMovement, stockLevels } from "@/lib/inventory/movements";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-26";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

/** A batch placed 2 Nov (day 24 today), with drugs, disinfectant, a vaccine and feed in stock. */
async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const { batch } = await createBatch(
    owner,
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
  const stocked = async (name: string, category: string, unit: string, quantity: number) => {
    const item = await createItem(owner, { name, category, unit, ...(category === "feed" && { unitKg: 25 }) });
    await recordMovement(
      owner,
      { itemId: item.id, type: "opening", quantity, unitCostKobo: 100_000, date: "2026-11-01" },
      TODAY,
    );
    return item;
  };
  const drug = await stocked("Amprolium", "medication", "sachet", 20);
  const disinfectant = await stocked("Virkon S", "disinfectant", "litre", 10);
  const vaccine = await stocked("Gumboro vaccine", "vaccine", "vial", 5);
  const feed = await stocked("Starter feed", "feed", "bag", 40);
  const onHand = async (id: string) => (await stockLevels(owner.farmId)).get(id)?.onHand;
  return { owner, batch, drug, disinfectant, vaccine, feed, onHand };
}

describe("a log records what was used, like feed", () => {
  it("takes drugs and disinfectant off stock, and gives them back when the log changes or goes", async () => {
    const { owner, batch, drug, disinfectant, onHand } = await farm();
    const { log } = await createLog(
      owner,
      {
        batchId: batch.id,
        date: TODAY,
        deaths: 1,
        supplies: [
          { itemId: drug.id, quantity: 3 },
          { itemId: disinfectant.id, quantity: 1.5 },
        ],
      },
      {},
      TODAY,
    );
    expect(log.supplies).toEqual([
      { itemId: drug.id, quantity: 3 },
      { itemId: disinfectant.id, quantity: 1.5 },
    ]);
    expect([await onHand(drug.id), await onHand(disinfectant.id)]).toEqual([17, 8.5]);

    // Changed: one more sachet, no disinfectant after all.
    const changed = await updateLog(
      owner,
      log.id,
      { batchId: batch.id, date: TODAY, deaths: 1, supplies: [{ itemId: drug.id, quantity: 4 }] },
      log.version,
      TODAY,
    );
    expect(changed.supplies).toEqual([{ itemId: drug.id, quantity: 4 }]);
    expect([await onHand(drug.id), await onHand(disinfectant.id)]).toEqual([16, 10]);

    await deleteLog(owner, log.id);
    expect(await onHand(drug.id)).toBe(20);
  });

  it("refuses feed or anything not in stock as a supply, a thing twice, and an empty amount", async () => {
    const { owner, batch, drug, feed } = await farm();
    const log = (supplies: unknown) =>
      refusal(createLog(owner, { batchId: batch.id, date: TODAY, supplies }, {}, TODAY));
    expect(await log([{ itemId: feed.id, quantity: 1 }])).toMatchObject({ field: "supplies" });
    expect(await log([{ itemId: String(oid()), quantity: 1 }])).toMatchObject({ field: "supplies" });
    expect(
      await log([
        { itemId: drug.id, quantity: 1 },
        { itemId: drug.id, quantity: 2 },
      ]),
    ).toMatchObject({
      field: "supplies",
    });
    const base = { batchId: "b", date: TODAY, deaths: 0, culls: 0, sold: 0, feedKg: 0, feedType: "", notes: "" };
    expect(validateLog({ ...base, supplies: [{ itemId: drug.id, quantity: 0 }] }, { today: TODAY }).supplies).toBe(
      "Choose each thing used and how much.",
    );
    expect(
      validateLog({ ...base, supplies: Array(21).fill({ itemId: drug.id, quantity: 1 }) }, { today: TODAY }).supplies,
    ).toBe("At most 20 things used.");
    // An empty row from the form is just left out.
    const { log: saved } = await createLog(
      owner,
      { batchId: batch.id, date: TODAY, supplies: [{ itemId: "", quantity: "" }] },
      {},
      TODAY,
    );
    expect(saved.supplies).toEqual([]);
  });

  it("records the vaccinations ticked on the health record, the vaccine off stock, once", async () => {
    const { owner, batch, vaccine, onHand } = await farm();
    const { log } = await createLog(
      owner,
      {
        batchId: batch.id,
        date: TODAY,
        vaccines: [
          { scheduleKey: "ibd-2", itemId: vaccine.id, quantity: 1 },
          { scheduleKey: "nd-2", itemId: null, quantity: null },
          { scheduleKey: "not-a-dose" },
        ],
      },
      {},
      TODAY,
    );
    const health = await listHealth(owner.farmId, batch.id);
    expect(health.map((e) => [e.scheduleKey, e.kind, e.date, e.givenBy, e.notes]).sort()).toEqual([
      ["ibd-2", "vaccination", TODAY, "Ada", "From the daily log"],
      ["nd-2", "vaccination", TODAY, "Ada", "From the daily log"],
    ]);
    expect(await onHand(vaccine.id)).toBe(4);
    // Ticked again on an edit: already recorded, so nothing more.
    await updateLog(
      owner,
      log.id,
      { batchId: batch.id, date: TODAY, vaccines: [{ scheduleKey: "ibd-2" }] },
      log.version,
      TODAY,
    );
    expect(await listHealth(owner.farmId, batch.id)).toHaveLength(2);
  });
});
