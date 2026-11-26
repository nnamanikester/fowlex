import { describe, expect, it, vi } from "vitest";

import { createHealthEvent, deleteHealthEvent, listHealth, updateHealthEvent } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createHouse } from "@/lib/houses/service";
import { BatchModel } from "@/models/batch";
import { HealthEventModel } from "@/models/health-event";
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

async function farm() {
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
      breed: "Ross 308",
      delivered: 1000,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
    },
    {},
    TODAY,
  );
  const vaccine = (over: Record<string, unknown> = {}) => ({
    batchId: batch.id,
    date: "2026-11-09",
    kind: "vaccination",
    product: "Lasota",
    scheduleKey: "nd-1",
    route: "Eye drop",
    ...over,
  });
  return { actor, batch, vaccine };
}

describe("health events", () => {
  it("records a vaccination with defaults, and lists newest first", async () => {
    const { actor, batch, vaccine } = await farm();
    const { event } = await createHealthEvent(actor, vaccine(), {}, TODAY);
    expect(event).toMatchObject({ kind: "vaccination", scheduleKey: "nd-1", costKobo: 0, withdrawalDays: 0, dose: "" });
    await createHealthEvent(
      actor,
      vaccine({ kind: "medication", product: "Amprolium", scheduleKey: "", date: "2026-11-20", withdrawalDays: 5 }),
      {},
      TODAY,
    );
    expect((await listHealth(actor.farmId, batch.id)).map((e) => [e.date, e.scheduleKey])).toEqual([
      ["2026-11-20", null],
      ["2026-11-09", "nd-1"],
    ]);
    expect(await listHealth(actor.farmId, "nope")).toEqual([]);
  });

  it("records each programme dose once, and again after it's deleted", async () => {
    const { actor, vaccine } = await farm();
    const { event } = await createHealthEvent(actor, vaccine(), {}, TODAY);
    expect(await refusal(createHealthEvent(actor, vaccine({ date: "2026-11-10" }), {}, TODAY))).toMatchObject({
      status: 409,
      code: "already_given",
      details: { id: event.id },
    });
    await deleteHealthEvent(actor, event.id);
    expect((await createHealthEvent(actor, vaccine(), {}, TODAY)).created).toBe(true);
  });

  it("returns the saved record for a resent request, even sent twice at once", async () => {
    const { actor, vaccine } = await farm();
    const requestId = "health-0001-abcd";
    const [a, b] = await Promise.all([
      createHealthEvent(actor, vaccine(), { requestId }, TODAY),
      createHealthEvent(actor, vaccine(), { requestId }, TODAY),
    ]);
    expect(a.event.id).toBe(b.event.id);
    expect(await HealthEventModel.countDocuments()).toBe(1);
  });

  it("refuses two different requests for one dose at once", async () => {
    const { actor, vaccine } = await farm();
    const results = await Promise.allSettled([
      createHealthEvent(actor, vaccine(), {}, TODAY),
      createHealthEvent(actor, vaccine(), {}, TODAY),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await HealthEventModel.countDocuments()).toBe(1);
  });

  it("refuses doses outside the programme, other farms' batches and bad dates", async () => {
    const { actor, vaccine } = await farm();
    expect(await refusal(createHealthEvent(actor, vaccine({ scheduleKey: "fowl-pox" }), {}, TODAY))).toMatchObject({
      field: "scheduleKey",
    });
    expect(await refusal(createHealthEvent(actor, vaccine({ date: "2026-11-01" }), {}, TODAY))).toMatchObject({
      field: "date",
    });
    const other = await farm();
    expect(await refusal(createHealthEvent(actor, other.vaccine(), {}, TODAY))).toMatchObject({ field: "batchId" });
  });

  it("locks a closed batch's record", async () => {
    const { actor, batch, vaccine } = await farm();
    const { event } = await createHealthEvent(actor, vaccine(), {}, TODAY);
    await BatchModel.updateOne({ _id: batch.id }, { status: "closed", closedOn: TODAY });
    expect(await refusal(createHealthEvent(actor, vaccine({ scheduleKey: "ibd-1" }), {}, TODAY))).toMatchObject({
      code: "closed",
    });
    expect(await refusal(updateHealthEvent(actor, event.id, vaccine(), 0, TODAY))).toMatchObject({ code: "closed" });
    expect(await refusal(deleteHealthEvent(actor, event.id))).toMatchObject({ code: "closed" });
  });

  it("edits a record, refusing stale forms and a dose already given", async () => {
    const { actor, vaccine } = await farm();
    const { event } = await createHealthEvent(actor, vaccine(), {}, TODAY);
    await createHealthEvent(actor, vaccine({ scheduleKey: "ibd-1", date: "2026-11-16" }), {}, TODAY);
    const saved = await updateHealthEvent(actor, event.id, vaccine({ givenBy: "Ada", costKobo: 450_000 }), 0, TODAY);
    expect(saved).toMatchObject({ givenBy: "Ada", costKobo: 450_000, version: 1 });
    expect(await refusal(updateHealthEvent(actor, event.id, vaccine(), 0, TODAY))).toMatchObject({ code: "stale" });
    expect(
      await refusal(updateHealthEvent(actor, event.id, vaccine({ scheduleKey: "ibd-1" }), 1, TODAY)),
    ).toMatchObject({
      code: "already_given",
    });
    expect(await refusal(updateHealthEvent(actor, "nope", vaccine(), 0, TODAY))).toMatchObject({ status: 404 });
  });

  it("refuses a save that loses a race", async () => {
    const { actor, vaccine } = await farm();
    const { event } = await createHealthEvent(actor, vaccine(), {}, TODAY);
    const lost = Object.assign(new Error("No matching document"), { name: "VersionError" });
    const save = vi.spyOn(HealthEventModel.prototype, "save").mockRejectedValueOnce(lost);
    expect(await refusal(updateHealthEvent(actor, event.id, vaccine(), 0, TODAY))).toMatchObject({ code: "stale" });
    save.mockRejectedValueOnce(new Error("disk full"));
    await expect(updateHealthEvent(actor, event.id, vaccine(), 0, TODAY)).rejects.toThrow("disk full");
  });
});
