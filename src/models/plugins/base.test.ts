import mongoose, { model, Schema, type Model } from "mongoose";
import { describe, expect, it } from "vitest";

import { basePlugin, type SoftDeleteMethods, WITH_DELETED } from "./base";
import { withTransaction } from "@/lib/db";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

// A stand-in model, so the plugin is tested on its own.
type Crate = { name: string; eggs: number; farmId: mongoose.Types.ObjectId; deletedAt: Date | null };
const schema = new Schema({ name: String, eggs: Number });
schema.plugin(basePlugin);
const Crate = model("TestCrate", schema) as unknown as Model<Crate, object, SoftDeleteMethods>;

const farmId = oid();

describe("basePlugin", () => {
  it("adds farmId (required), createdBy, timestamps and deletedAt", async () => {
    const crate = await Crate.create({ name: "A", eggs: 30, farmId });
    expect(crate.toObject()).toMatchObject({ farmId, createdBy: null, deletedAt: null });
    expect(crate.toObject()).toHaveProperty("createdAt");
    await expect(Crate.create({ name: "No farm", eggs: 1 })).rejects.toThrow(/farmId/);
  });

  it("creates and soft-deletes a document, and normal queries no longer see it", async () => {
    const kept = await Crate.create({ name: "Kept", eggs: 30, farmId });
    const gone = await Crate.create({ name: "Gone", eggs: 12, farmId });
    await gone.softDelete();

    expect((await Crate.find()).map((c) => c.name)).toEqual(["Kept"]);
    expect(await Crate.findById(gone._id)).toBeNull();
    expect(await Crate.findOne({ name: "Gone" })).toBeNull();
    expect(await Crate.countDocuments()).toBe(1);
    expect(await Crate.distinct("name")).toEqual(["Kept"]);
    const [sum] = await Crate.aggregate<{ eggs: number }>([{ $group: { _id: null, eggs: { $sum: "$eggs" } } }]);
    expect(sum.eggs).toBe(30);

    // Updates can't touch it either.
    await Crate.updateMany({}, { $inc: { eggs: 1 } });
    expect((await Crate.findById(kept._id).lean())?.eggs).toBe(31);

    // It's still there for whoever asks.
    const all = await Crate.find().setOptions(WITH_DELETED);
    expect(all.map((c) => c.name).sort()).toEqual(["Gone", "Kept"]);
    const deleted = await Crate.findOne({ deletedAt: { $ne: null } });
    expect(deleted?.name).toBe("Gone");
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    expect((await Crate.aggregate([{ $match: {} }]).option(WITH_DELETED)).length).toBe(2);
  });

  it("restores a soft-deleted document", async () => {
    const crate = await Crate.create({ name: "Back", eggs: 6, farmId });
    await crate.softDelete();
    const found = await Crate.findById(crate._id).setOptions(WITH_DELETED);
    await found!.restore();
    expect(await Crate.findById(crate._id)).not.toBeNull();
  });
});

describe("withTransaction", () => {
  it("commits every write together", async () => {
    const result = await withTransaction(async (session) => {
      await Crate.create([{ name: "One", eggs: 1, farmId }], { session });
      await Crate.create([{ name: "Two", eggs: 2, farmId }], { session });
      return "done";
    });
    expect(result).toBe("done");
    expect(await Crate.countDocuments()).toBe(2);
  });

  it("saves nothing when any step fails", async () => {
    await expect(
      withTransaction(async (session) => {
        await Crate.create([{ name: "One", eggs: 1, farmId }], { session });
        throw new Error("Stock movement failed");
      }),
    ).rejects.toThrow("Stock movement failed");
    expect(await Crate.countDocuments()).toBe(0);
  });
});
