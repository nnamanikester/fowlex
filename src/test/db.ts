import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll } from "vitest";

import { connectDb, disconnectDb } from "@/lib/db";

/**
 * A real MongoDB for the tests in this file: an in-memory, single-node replica set (so transactions
 * work, as on Atlas), emptied after each test. The first run downloads the mongod binary.
 */
export function setupTestDb() {
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    process.env.MONGODB_URI = replSet.getUri("fowlex-test");
    await connectDb();
    // Build indexes (unique ones included) before the first test relies on them.
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  }, 120_000);

  afterEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectDb();
    await replSet?.stop();
  });
}

export const oid = () => new mongoose.Types.ObjectId();
