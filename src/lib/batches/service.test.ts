import { describe, expect, it, vi } from "vitest";

import {
  batchSummaries,
  createBatch,
  deleteBatch,
  getBatch,
  listBatches,
  setBatchStatus,
  updateBatch,
} from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createHouse, deleteHouse, listHouses, updateHouse } from "@/lib/houses/service";
import { BatchModel } from "@/models/batch";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-26";
const owner = (): CurrentUser => ({
  id: String(oid()),
  farmId: String(oid()),
  name: "Ada",
  email: "a@f.com",
  role: "owner",
});
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string; details?: { warnings: { code: string }[] } }) => ({
      status: e.status,
      code: e.code,
      field: e.field,
      warnings: e.details?.warnings?.map((w) => w.code),
    }),
  );

async function farm() {
  const actor = owner();
  const house = await createHouse(actor, { name: "House 1", capacity: 1200 });
  const input = (over: Record<string, unknown> = {}) => ({
    houseId: house.id,
    placedOn: "2026-11-02",
    breed: "Arbor Acres",
    delivered: 1000,
    deadOnArrival: 0,
    freeExtras: 0,
    pricePerChickKobo: 85_000,
    supplierName: "",
    ageAtPlacementDays: 0,
    targetSellAgeDays: 42,
    targetWeightGrams: 2200,
    notes: "",
    ...over,
  });
  return { actor, house, input };
}

describe("createBatch", () => {
  it("creates a batch of 1,000 birds with the year's next code and its age", async () => {
    const { actor, input } = await farm();
    const { batch, created } = await createBatch(actor, input(), {}, TODAY);
    expect(created).toBe(true);
    expect(batch).toMatchObject({
      code: "B-2026-01",
      phase: "active",
      placed: 1000,
      liveBirds: 1000,
      ageDays: 24,
      houseName: "House 1",
    });
    expect(batch.chickCostKobo).toBe(85_000_000);
    expect((await listBatches(actor.farmId, TODAY)).map((b) => b.code)).toEqual(["B-2026-01"]);
  });

  it("numbers codes per placement year, and never repeats one when created at the same moment", async () => {
    const { actor, input } = await farm();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createBatch(actor, input({ delivered: 100 }), { confirm: true }, TODAY)),
    );
    expect(results.map((r) => r.batch.code).sort()).toEqual(Array.from({ length: 8 }, (_, i) => `B-2026-0${i + 1}`));
    const next = await createBatch(
      actor,
      input({ placedOn: "2027-01-03", delivered: 100 }),
      { confirm: true },
      "2027-01-03",
    );
    expect(next.batch.code).toBe("B-2027-01");
  });

  it("returns the same batch for a retried request, even sent twice at once", async () => {
    const { actor, input } = await farm();
    const requestId = "req-1234-abcd";
    const [a, b] = await Promise.all([
      createBatch(actor, input(), { requestId }, TODAY),
      createBatch(actor, input(), { requestId }, TODAY),
    ]);
    expect(a.batch.id).toBe(b.batch.id);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    const again = await createBatch(actor, input(), { requestId }, TODAY);
    expect(again).toMatchObject({ created: false, batch: { id: a.batch.id } });
    expect(await BatchModel.countDocuments()).toBe(1);
  });

  it("asks to confirm going over capacity, then places when confirmed", async () => {
    const { actor, input } = await farm();
    expect(await refusal(createBatch(actor, input({ delivered: 1300 }), {}, TODAY))).toMatchObject({
      status: 409,
      code: "needs_confirmation",
      warnings: ["over_capacity"],
    });
    expect((await createBatch(actor, input({ delivered: 1300 }), { confirm: true }, TODAY)).created).toBe(true);
  });

  it("counts the other batches in the house towards capacity, and flags sharing it", async () => {
    const { actor, input } = await farm();
    await createBatch(actor, input({ delivered: 700 }), {}, TODAY);
    expect(await refusal(createBatch(actor, input({ delivered: 600 }), {}, TODAY))).toMatchObject({
      warnings: ["house_shared", "over_capacity"],
    });
  });

  it("flags a house under maintenance or retired, a resting house and an old date", async () => {
    const { actor, house, input } = await farm();
    await updateHouse(actor, house.id, { ...house, status: "maintenance" }, house.version);
    expect((await refusal(createBatch(actor, input(), {}, TODAY)))?.warnings).toEqual(["house_maintenance"]);

    const [h] = await listHouses(actor.farmId);
    await updateHouse(actor, h.id, { ...h, status: "retired" }, h.version);
    expect((await refusal(createBatch(actor, input(), {}, TODAY)))?.warnings).toEqual(["house_retired"]);

    const fresh = await farm();
    await BatchModel.create({
      ...fresh.input({ placedOn: "2026-09-01" }),
      farmId: fresh.actor.farmId,
      code: "B-2026-90",
      year: 2026,
      seq: 90,
      status: "closed",
      closedOn: "2026-10-20",
    });
    expect(
      (await refusal(createBatch(fresh.actor, fresh.input({ placedOn: "2026-10-25" }), {}, TODAY)))?.warnings,
    ).toEqual(["house_resting"]);
    // Rested long enough (14 days by default): placed without a question.
    expect((await createBatch(fresh.actor, fresh.input({ placedOn: "2026-11-05" }), {}, TODAY)).created).toBe(true);
    // More than 8 weeks ago looks more like a typo than a late record.
    const third = await farm();
    expect(
      (await refusal(createBatch(third.actor, third.input({ placedOn: "2026-09-01" }), {}, TODAY)))?.warnings,
    ).toEqual(["old_date"]);
  });

  it("refuses a house from another farm, and bad input by field", async () => {
    const { actor, input } = await farm();
    const other = await farm();
    expect(await refusal(createBatch(actor, input({ houseId: other.house.id }), {}, TODAY))).toMatchObject({
      status: 400,
      field: "houseId",
    });
    expect(await refusal(createBatch(actor, input({ houseId: "not-an-id" }), {}, TODAY))).toMatchObject({
      field: "houseId",
    });
    expect(await refusal(createBatch(actor, input({ deadOnArrival: 1000 }), {}, TODAY))).toMatchObject({
      field: "deadOnArrival",
    });
  });
});

describe("planned batches", () => {
  it("are planned until their day, can't start selling early, and become active on the day", async () => {
    const { actor, input } = await farm();
    const { batch } = await createBatch(actor, input({ placedOn: "2026-11-30" }), {}, TODAY);
    expect(batch).toMatchObject({ phase: "planned", ageDays: -4 });
    expect(await refusal(setBatchStatus(actor, batch.id, "selling", TODAY))).toMatchObject({ code: "not_placed" });
    expect((await getBatch(actor.farmId, batch.id, "2026-11-30"))?.phase).toBe("active");
  });
});

describe("updateBatch", () => {
  it("saves edits, refuses a stale form, and re-checks a move to a full house", async () => {
    const { actor, input } = await farm();
    const { batch } = await createBatch(actor, input(), {}, TODAY);
    const saved = await updateBatch(
      actor,
      batch.id,
      input({ breed: "Cobb 500", deadOnArrival: 12 }),
      { version: batch.version },
      TODAY,
    );
    expect(saved).toMatchObject({ breed: "Cobb 500", placed: 988, version: 1, code: "B-2026-01" });

    expect(await refusal(updateBatch(actor, batch.id, input(), { version: batch.version }, TODAY))).toMatchObject({
      code: "stale",
    });

    const small = await createHouse(actor, { name: "Small", capacity: 50 });
    expect(
      await refusal(updateBatch(actor, batch.id, input({ houseId: small.id }), { version: 1 }, TODAY)),
    ).toMatchObject({
      code: "needs_confirmation",
      warnings: ["over_capacity"],
    });
    const moved = await updateBatch(
      actor,
      batch.id,
      input({ houseId: small.id }),
      { version: 1, confirm: true },
      TODAY,
    );
    expect(moved.houseName).toBe("Small");
  });

  it("can't change a closed batch, or one on another farm", async () => {
    const { actor, input } = await farm();
    const { batch } = await createBatch(actor, input(), {}, TODAY);
    await BatchModel.updateOne({ _id: batch.id }, { status: "closed", closedOn: TODAY });
    expect(await refusal(updateBatch(actor, batch.id, input(), { version: 0 }, TODAY))).toMatchObject({
      code: "closed",
    });
    expect(await refusal(setBatchStatus(actor, batch.id, "selling", TODAY))).toMatchObject({ code: "closed" });
    expect(await refusal(updateBatch(owner(), batch.id, input(), { version: 0 }, TODAY))).toMatchObject({
      status: 404,
    });
  });
});

describe("status, delete and the shell", () => {
  it("moves between growing and selling", async () => {
    const { actor, input } = await farm();
    const { batch } = await createBatch(actor, input(), {}, TODAY);
    expect((await setBatchStatus(actor, batch.id, "selling", TODAY)).phase).toBe("selling");
    expect((await setBatchStatus(actor, batch.id, "active", TODAY)).phase).toBe("active");
    expect(await refusal(setBatchStatus(actor, batch.id, "closed", TODAY))).toMatchObject({ code: "invalid_status" });
  });

  it("deletes a batch, and keeps a house that has held one", async () => {
    const { actor, house, input } = await farm();
    const { batch } = await createBatch(actor, input(), {}, TODAY);
    expect(await refusal(deleteHouse(actor, house.id))).toMatchObject({ code: "has_batches" });
    await deleteBatch(actor, batch.id);
    expect(await listBatches(actor.farmId, TODAY)).toEqual([]);
    expect(await getBatch(actor.farmId, batch.id, TODAY)).toBeNull();
  });

  it("summarises batches still on the farm for the switcher, and fills houses", async () => {
    const { actor, input } = await farm();
    await createBatch(actor, input({ delivered: 500 }), {}, TODAY);
    const planned = await createBatch(
      actor,
      input({ placedOn: "2026-12-01", delivered: 300 }),
      { confirm: true },
      TODAY,
    );
    const closed = await createBatch(
      actor,
      input({ placedOn: "2026-09-01", delivered: 200 }),
      { confirm: true },
      TODAY,
    );
    await BatchModel.updateOne({ _id: closed.batch.id }, { status: "closed", closedOn: "2026-10-15" });

    expect((await batchSummaries(actor.farmId, TODAY)).map((s) => [s.code, s.status, s.day, s.liveBirds])).toEqual([
      [planned.batch.code, "planned", -5, 300],
      ["B-2026-01", "active", 24, 500],
    ]);
    const [house] = await listHouses(actor.farmId);
    expect(house).toMatchObject({ occupied: 800, batchCount: 2 });
  });
});

describe("races", () => {
  it("refuses a save that loses a race with another save (version error)", async () => {
    const { actor, input } = await farm();
    const { batch } = await createBatch(actor, input(), {}, TODAY);
    const lost = Object.assign(new Error("No matching document"), { name: "VersionError" });
    const save = vi.spyOn(BatchModel.prototype, "save").mockRejectedValueOnce(lost);
    expect(
      await refusal(updateBatch(actor, batch.id, input({ breed: "Ross 308" }), { version: 0 }, TODAY)),
    ).toMatchObject({
      code: "stale",
    });
    save.mockRejectedValueOnce(new Error("disk full"));
    await expect(updateBatch(actor, batch.id, input(), { version: 0 }, TODAY)).rejects.toThrow("disk full");
  });

  it("finds nothing for an id that isn't one", async () => {
    const { actor } = await farm();
    expect(await getBatch(actor.farmId, "not-an-id", TODAY)).toBeNull();
    expect(await refusal(deleteBatch(actor, "not-an-id"))).toMatchObject({ status: 404 });
  });
});
