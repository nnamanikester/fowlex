import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { ALL_MODELS, ensureIndexes } from "./index";
import { setupTestDb } from "@/test/db";

setupTestDb();

describe("ensureIndexes", () => {
  it("lists every model the app defines", () => {
    const app = Object.keys(mongoose.models).filter((name) => !name.startsWith("Test"));
    expect(ALL_MODELS.map((m) => m.modelName).sort()).toEqual(app.sort());
  });

  it("builds the indexes the app relies on, and is safe to run again", async () => {
    await mongoose.connection.db!.dropDatabase();
    expect(await ensureIndexes()).toHaveLength(ALL_MODELS.length);
    await ensureIndexes();

    const indexes = async (collection: string) =>
      (await mongoose.connection.db!.collection(collection).indexes()).map((i) => ({ key: i.key, unique: !!i.unique }));
    expect(await indexes("users")).toContainEqual({ key: { email: 1 }, unique: true });
    expect(await indexes("settings")).toContainEqual({ key: { farmId: 1 }, unique: true });
    expect(await indexes("auditlogs")).toContainEqual({ key: { farmId: 1, createdAt: -1 }, unique: false });
    const resets = await mongoose.connection.db!.collection("passwordresets").indexes();
    expect(resets.find((i) => i.key.expiresAt)?.expireAfterSeconds).toBe(24 * 60 * 60);
  });
});
