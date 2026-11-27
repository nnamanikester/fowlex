import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { connectDb, disconnectDb } from "./db";

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await disconnectDb();
});

describe("connectDb", () => {
  it("says what's missing without MONGODB_URI", async () => {
    vi.stubEnv("MONGODB_URI", "");
    await expect(connectDb()).rejects.toThrow("MONGODB_URI is not set");
  });

  it("connects once, and tries again after a failure", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://example.invalid/fowlex");
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockRejectedValueOnce(new Error("no route to host"))
      .mockResolvedValue(mongoose);
    await expect(connectDb()).rejects.toThrow("no route to host");
    await connectDb();
    await connectDb();
    expect(connect).toHaveBeenCalledTimes(2);
    vi.spyOn(mongoose, "disconnect").mockResolvedValue(undefined);
  });

  it("doesn't build indexes at runtime in production (yarn db:indexes does, at deploy)", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://example.invalid/fowlex");
    const connect = vi.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
    vi.stubEnv("NODE_ENV", "production");
    await connectDb();
    expect(connect.mock.calls[0][1]).toMatchObject({ autoIndex: false, autoCreate: false, bufferCommands: false });
    vi.spyOn(mongoose, "disconnect").mockResolvedValue(undefined);
  });
});
