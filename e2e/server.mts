/**
 * The app the e2e tests run against: a fresh in-memory MongoDB (a replica set, like Atlas) seeded
 * with a farm and one person per role, then the Next.js command given after `--`, pointed at it.
 *
 *   tsx e2e/server.mts -- npx next dev --port 3108
 */
import { spawn } from "node:child_process";

import bcrypt from "bcryptjs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

import { E2E_BATCHES, E2E_HOUSES, E2E_PASSWORD, E2E_USERS } from "./users";
import { BatchModel } from "../src/models/batch";
import { CounterModel } from "../src/models/counter";
import { HouseModel } from "../src/models/house";
import { FarmModel } from "../src/models/farm";
import { ensureIndexes } from "../src/models/index";
import { UserModel } from "../src/models/user";

const command = process.argv.slice(process.argv.indexOf("--") + 1);

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
const uri = replSet.getUri("fowlex-e2e");

await mongoose.connect(uri);
// Every model's indexes, as a deploy builds them (production doesn't build indexes at runtime).
await ensureIndexes();
const farm = await FarmModel.create({ name: "Fowlex Farms" });
const passwordHash = await bcrypt.hash(E2E_PASSWORD, 4); // Low cost: test data only.
await UserModel.create(Object.values(E2E_USERS).map((u) => ({ ...u, farmId: farm._id, passwordHash })));
const houses = await HouseModel.create(
  E2E_HOUSES.map((h) => ({ ...h, nameKey: h.name.toLowerCase(), farmId: farm._id })),
);
await BatchModel.create(
  E2E_BATCHES.map((b, i) => ({
    farmId: farm._id,
    houseId: houses.find((h) => h.name === b.house)!._id,
    code: b.code,
    year: Number(b.placedOn.slice(0, 4)),
    seq: i + 1,
    breed: "Arbor Acres",
    placedOn: b.placedOn,
    delivered: b.delivered,
    pricePerChickKobo: 85_000,
  })),
);
// The codes above took the first numbers of their years.
for (const b of E2E_BATCHES)
  await CounterModel.updateOne(
    { farmId: farm._id, key: `batch:${b.placedOn.slice(0, 4)}` },
    { $max: { seq: Number(b.code.slice(-2)) } },
    { upsert: true },
  );
await mongoose.disconnect();

const app = spawn(command[0], command.slice(1), {
  stdio: "inherit",
  env: {
    ...process.env,
    MONGODB_URI: uri,
    JWT_SECRET: "e2e-only-secret-that-is-long-enough-for-hs256",
    PLAYWRIGHT: "1",
    // Next loads .env.local even for `next start`, so blank every outside service: tests never
    // send real email, charge through Paystack or write to Blob. (A set variable, even empty,
    // isn't overridden by .env files.) Emails go to the outbox instead.
    RESEND_API_KEY: "",
    PAYSTACK_SECRET_KEY: "",
    // Payments go to the built-in Paystack simulator, never Paystack.
    PAYSTACK_SIMULATE: "1",
    // Receipts are kept in memory.
    BLOB_READ_WRITE_TOKEN: "",
    UPLOADS_LOCAL: "1",
    CRON_SECRET: "",
  },
});

const stop = async () => {
  app.kill("SIGTERM");
  await replSet.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
app.on("exit", async (code) => {
  await replSet.stop();
  process.exit(code ?? 0);
});
