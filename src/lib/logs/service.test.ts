import { describe, expect, it, vi } from "vitest";

import { createLog, deleteLog, listLogs, logTotals, updateLog } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createHouse } from "@/lib/houses/service";
import { BatchModel } from "@/models/batch";
import { DailyLogModel } from "@/models/daily-log";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-26";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string; details?: unknown }) => ({
      status: e.status,
      code: e.code,
      field: e.field,
      details: e.details,
    }),
  );

async function farm(delivered = 1000) {
  const actor: CurrentUser = {
    id: String(oid()),
    farmId: String(oid()),
    name: "Tunde",
    email: "t@f.com",
    role: "staff",
  };
  const owner = { ...actor, role: "owner" as const };
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const { batch } = await createBatch(
    owner,
    {
      houseId: house.id,
      placedOn: "2026-11-02",
      breed: "Arbor Acres",
      delivered,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
    },
    {},
    TODAY,
  );
  const log = (over: Record<string, unknown> = {}) => ({
    batchId: batch.id,
    date: TODAY,
    deaths: 2,
    feedKg: 80,
    ...over,
  });
  return { actor, batch, log };
}

describe("daily logs", () => {
  it("records a day with defaults, and lists newest first", async () => {
    const { actor, batch, log } = await farm();
    const first = await createLog(actor, log({ date: "2026-11-24" }), {}, TODAY);
    expect(first.log).toMatchObject({
      deaths: 2,
      culls: 0,
      sold: 0,
      feedKg: 80,
      waterLitres: null,
      avgWeightGrams: null,
    });
    await createLog(actor, log({ date: "2026-11-25", avgWeightGrams: 1100 }), {}, TODAY);
    expect((await listLogs(actor.farmId, batch.id)).map((l) => l.date)).toEqual(["2026-11-25", "2026-11-24"]);
    expect(await listLogs(actor.farmId, "nope")).toEqual([]);
  });

  it("refuses a second log for the same day, pointing at the first", async () => {
    const { actor, log } = await farm();
    const { log: first } = await createLog(actor, log(), {}, TODAY);
    expect(await refusal(createLog(actor, log({ deaths: 5 }), {}, TODAY))).toMatchObject({
      status: 409,
      code: "already_logged",
      field: "date",
      details: { id: first.id },
    });
  });

  it("returns the saved log when a phone resends it, even twice at once", async () => {
    const { actor, log } = await farm();
    const requestId = "phone-0001-abcd";
    const [a, b] = await Promise.all([
      createLog(actor, log(), { requestId }, TODAY),
      createLog(actor, log(), { requestId }, TODAY),
    ]);
    expect(a.log.id).toBe(b.log.id);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(await DailyLogModel.countDocuments()).toBe(1);
  });

  it("won't remove more birds than are left, counting earlier days", async () => {
    const { actor, log } = await farm(10);
    await createLog(actor, log({ date: "2026-11-25", deaths: 6 }), {}, TODAY);
    expect(await refusal(createLog(actor, log({ deaths: 3, culls: 2 }), {}, TODAY))).toMatchObject({
      field: "deaths",
    });
    expect((await createLog(actor, log({ deaths: 3, culls: 1 }), {}, TODAY)).created).toBe(true);
  });

  it("refuses days before placement or in the future, and other farms' batches", async () => {
    const { actor, log } = await farm();
    expect(await refusal(createLog(actor, log({ date: "2026-11-01" }), {}, TODAY))).toMatchObject({ field: "date" });
    expect(await refusal(createLog(actor, log({ date: "2026-11-27" }), {}, TODAY))).toMatchObject({ field: "date" });
    const other = await farm();
    expect(await refusal(createLog(actor, other.log(), {}, TODAY))).toMatchObject({ field: "batchId" });
    expect(await refusal(createLog(actor, log({ batchId: "nope" }), {}, TODAY))).toMatchObject({ field: "batchId" });
  });

  it("locks logs on a closed batch", async () => {
    const { actor, batch, log } = await farm();
    const { log: saved } = await createLog(actor, log(), {}, TODAY);
    await BatchModel.updateOne({ _id: batch.id }, { status: "closed", closedOn: TODAY });
    expect(await refusal(createLog(actor, log({ date: "2026-11-25" }), {}, TODAY))).toMatchObject({ code: "closed" });
    expect(await refusal(updateLog(actor, saved.id, log(), saved.version, TODAY))).toMatchObject({ code: "closed" });
    expect(await refusal(deleteLog(actor, saved.id))).toMatchObject({ code: "closed" });
  });

  it("edits a log (refusing stale forms and a clash with another day), and deletes it", async () => {
    const { actor, batch, log } = await farm();
    const { log: a } = await createLog(actor, log({ date: "2026-11-25" }), {}, TODAY);
    await createLog(actor, log(), {}, TODAY);
    const saved = await updateLog(actor, a.id, log({ date: "2026-11-25", deaths: 4 }), a.version, TODAY);
    expect(saved).toMatchObject({ deaths: 4, version: 1, batchId: batch.id });
    expect(await refusal(updateLog(actor, a.id, log({ date: "2026-11-25" }), a.version, TODAY))).toMatchObject({
      code: "stale",
    });
    expect(await refusal(updateLog(actor, a.id, log({ date: TODAY }), 1, TODAY))).toMatchObject({
      code: "already_logged",
    });
    // Its own deaths don't count against it when editing.
    expect((await updateLog(actor, a.id, log({ date: "2026-11-25", deaths: 4 }), 1, TODAY)).deaths).toBe(4);

    await deleteLog(actor, a.id);
    expect((await listLogs(actor.farmId, batch.id)).map((l) => l.date)).toEqual([TODAY]);
    // The day can be logged again once its log is deleted.
    expect((await createLog(actor, log({ date: "2026-11-25" }), {}, TODAY)).created).toBe(true);
    expect(await refusal(deleteLog(actor, a.id))).toMatchObject({ status: 404 });
    expect(await refusal(updateLog(actor, "nope", log(), 0, TODAY))).toMatchObject({ status: 404 });
  });

  it("totals each batch's logs, with the latest weighing", async () => {
    const { actor, batch, log } = await farm();
    await createLog(
      actor,
      log({ date: "2026-11-20", deaths: 3, culls: 1, feedKg: 50.5, avgWeightGrams: 900 }),
      {},
      TODAY,
    );
    await createLog(
      actor,
      log({ date: "2026-11-24", deaths: 2, sold: 10, feedKg: 60.2, avgWeightGrams: 1300 }),
      {},
      TODAY,
    );
    await createLog(actor, log({ date: "2026-11-25", deaths: 1, feedKg: 70 }), {}, TODAY);
    expect((await logTotals(actor.farmId, [batch.id])).get(batch.id)).toEqual({
      deaths: 6,
      culls: 1,
      sold: 10,
      feedKg: 180.7,
      days: 3,
      lastWeight: { date: "2026-11-24", grams: 1300 },
    });
  });

  it("refuses a save that loses a race", async () => {
    const { actor, log } = await farm();
    const { log: a } = await createLog(actor, log(), {}, TODAY);
    const lost = Object.assign(new Error("No matching document"), { name: "VersionError" });
    const save = vi.spyOn(DailyLogModel.prototype, "save").mockRejectedValueOnce(lost);
    expect(await refusal(updateLog(actor, a.id, log({ deaths: 9 }), 0, TODAY))).toMatchObject({ code: "stale" });
    save.mockRejectedValueOnce(new Error("disk full"));
    await expect(updateLog(actor, a.id, log({ deaths: 9 }), 0, TODAY)).rejects.toThrow("disk full");
  });
});
