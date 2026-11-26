import { describe, expect, it, vi } from "vitest";

import { createItem, deleteItem, listItems, updateItem } from "./items";
import type { CurrentUser } from "@/lib/auth/current-user";
import { InventoryItemModel } from "@/models/inventory-item";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const actor = (): CurrentUser => ({
  id: String(oid()),
  farmId: String(oid()),
  name: "Ada",
  email: "a@f.com",
  role: "manager",
});
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );
const starter = { name: "Starter feed", category: "feed", unit: "bag", unitKg: 25, reorderLevel: 10 };

describe("inventory items", () => {
  it("adds a 25 kg bag of starter feed with a reorder level of 10, and lists by kind then name", async () => {
    const a = actor();
    const item = await createItem(a, { ...starter, name: "  Starter   feed " });
    expect(item).toMatchObject({ name: "Starter feed", unitKg: 25, reorderLevel: 10, notes: "", archived: false });
    await createItem(a, { name: "Diesel", category: "fuel", unit: "litre", reorderLevel: "" });
    await createItem(a, { name: "Grower feed", category: "feed", unit: "bag", unitKg: 25 });
    expect((await listItems(a.farmId)).map((i) => i.name)).toEqual(["Grower feed", "Starter feed", "Diesel"]);
    expect(await listItems(String(oid()))).toEqual([]);
  });

  it("refuses a second item with the same name on a farm, but not on another", async () => {
    const a = actor();
    await createItem(a, starter);
    expect(await refusal(createItem(a, { ...starter, name: "starter FEED" }))).toMatchObject({
      status: 409,
      code: "duplicate_name",
    });
    expect((await createItem(actor(), starter)).name).toBe("Starter feed");
    expect(await refusal(createItem(a, { ...starter, unitKg: null }))).toMatchObject({ field: "unitKg" });
  });

  it("edits, archives and deletes, refusing stale forms and clashing names", async () => {
    const a = actor();
    const item = await createItem(a, starter);
    await createItem(a, { ...starter, name: "Grower feed" });
    const saved = await updateItem(a, item.id, { ...starter, reorderLevel: 15, archived: true }, 0);
    expect(saved).toMatchObject({ reorderLevel: 15, archived: true, version: 1 });
    expect(await refusal(updateItem(a, item.id, starter, 0))).toMatchObject({ code: "stale" });
    expect(await refusal(updateItem(a, item.id, { ...starter, name: "Grower Feed" }, 1))).toMatchObject({
      code: "duplicate_name",
    });
    await deleteItem(a, item.id);
    expect((await listItems(a.farmId)).map((i) => i.name)).toEqual(["Grower feed"]);
    expect(await refusal(deleteItem(a, item.id))).toMatchObject({ status: 404 });
    expect(await refusal(updateItem(a, "nope", starter, 0))).toMatchObject({ status: 404 });
  });

  it("refuses a save that loses a race", async () => {
    const a = actor();
    const item = await createItem(a, starter);
    const lost = Object.assign(new Error("No matching document"), { name: "VersionError" });
    const save = vi.spyOn(InventoryItemModel.prototype, "save").mockRejectedValueOnce(lost);
    expect(await refusal(updateItem(a, item.id, starter, 0))).toMatchObject({ code: "stale" });
    save.mockRejectedValueOnce(new Error("disk full"));
    await expect(updateItem(a, item.id, starter, 0)).rejects.toThrow("disk full");
    vi.spyOn(InventoryItemModel, "create").mockRejectedValueOnce(new Error("disk full"));
    await expect(createItem(a, { ...starter, name: "Other" })).rejects.toThrow("disk full");
  });
});
