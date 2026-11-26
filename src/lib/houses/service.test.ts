import { describe, expect, it, vi } from "vitest";

import { createHouse, deleteHouse, listHouses, updateHouse } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HouseModel } from "@/models/house";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const actor = (farmId = String(oid())): CurrentUser => ({
  id: String(oid()),
  farmId,
  name: "Ada",
  email: "a@f.com",
  role: "owner",
});
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

describe("houses", () => {
  it("creates a house with defaults and lists houses in natural order", async () => {
    const a = actor();
    for (const name of ["House 10", "  House   2 ", "House 1"]) await createHouse(a, { name, capacity: 1000 });
    const houses = await listHouses(a.farmId);
    expect(houses.map((h) => h.name)).toEqual(["House 1", "House 2", "House 10"]);
    expect(houses[0]).toMatchObject({
      capacity: 1000,
      floorAreaSqm: null,
      system: "deep-litter",
      ventilation: "open-sided",
      status: "active",
      version: 0,
    });
  });

  it("refuses a second house with the same name, ignoring case and spacing, per farm", async () => {
    const a = actor();
    await createHouse(a, { name: "House 1", capacity: 500 });
    expect(await refusal(createHouse(a, { name: " house   1", capacity: 600 }))).toEqual({
      status: 409,
      code: "duplicate_name",
      field: "name",
    });
    // Another farm may have its own House 1.
    expect(await refusal(createHouse(actor(), { name: "House 1", capacity: 500 }))).toBeNull();
  });

  it("names the field when the form is wrong", async () => {
    expect(await refusal(createHouse(actor(), { name: "A", capacity: 0 }))).toMatchObject({
      status: 400,
      field: "capacity",
    });
  });

  it("saves edits, and refuses an edit made from an out-of-date form", async () => {
    const a = actor();
    const house = await createHouse(a, { name: "House 1", capacity: 500 });
    const saved = await updateHouse(a, house.id, { ...house, capacity: 800, status: "maintenance" }, house.version);
    expect(saved).toMatchObject({ capacity: 800, status: "maintenance", version: 1 });

    // A second person still holding version 0.
    expect(await refusal(updateHouse(a, house.id, { ...house, capacity: 900 }, house.version))).toMatchObject({
      status: 409,
      code: "stale",
    });
    expect(await refusal(updateHouse(a, house.id, { ...house, capacity: 900 }, undefined))).toMatchObject({
      code: "stale",
    });
  });

  it("refuses renaming onto another house's name, and edits to another farm's house", async () => {
    const a = actor();
    await createHouse(a, { name: "House 1", capacity: 500 });
    const two = await createHouse(a, { name: "House 2", capacity: 500 });
    expect(await refusal(updateHouse(a, two.id, { ...two, name: "HOUSE 1" }, two.version))).toMatchObject({
      code: "duplicate_name",
    });
    expect(await refusal(updateHouse(actor(), two.id, two, two.version))).toMatchObject({ status: 404 });
  });

  it("deletes a house (it leaves the list) and frees its name", async () => {
    const a = actor();
    const house = await createHouse(a, { name: "House 1", capacity: 500 });
    await deleteHouse(a, house.id);
    expect(await listHouses(a.farmId)).toEqual([]);
    expect(await HouseModel.countDocuments({ deletedAt: { $ne: null } })).toBe(1);
    expect(await refusal(createHouse(a, { name: "House 1", capacity: 500 }))).toBeNull();
    expect(await refusal(deleteHouse(a, house.id))).toMatchObject({ status: 404 });
  });

  it("saves when the form holds the version someone else just saved", async () => {
    const a = actor();
    const house = await createHouse(a, { name: "House 1", capacity: 500 });
    // Someone saves directly after this form loaded but before it saves.
    const doc = (await HouseModel.findById(house.id))!;
    doc.capacity = 700;
    await doc.save();
    expect(await refusal(updateHouse(a, house.id, { ...house, capacity: 900 }, 1))).toBeNull();
    expect((await HouseModel.findById(house.id))?.capacity).toBe(900);
  });
});

describe("house races", () => {
  it("refuses a save that loses a race with another save, and passes other errors on", async () => {
    const a = actor();
    const house = await createHouse(a, { name: "House 1", capacity: 500 });
    const lost = Object.assign(new Error("No matching document"), { name: "VersionError" });
    const save = vi.spyOn(HouseModel.prototype, "save").mockRejectedValueOnce(lost);
    expect(await refusal(updateHouse(a, house.id, { ...house, capacity: 600 }, 0))).toMatchObject({ code: "stale" });
    save.mockRejectedValueOnce(new Error("disk full"));
    await expect(updateHouse(a, house.id, { ...house, capacity: 600 }, 0)).rejects.toThrow("disk full");
    const create = vi.spyOn(HouseModel, "create").mockRejectedValueOnce(new Error("network"));
    await expect(createHouse(a, { name: "House 2", capacity: 5 })).rejects.toThrow("network");
    create.mockRestore();
  });
});
