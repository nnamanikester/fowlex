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

import { E2E_PASSWORD, E2E_USERS } from "./users";
import { FarmModel } from "../src/models/farm";
import { UserModel } from "../src/models/user";

const command = process.argv.slice(process.argv.indexOf("--") + 1);

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
const uri = replSet.getUri("fowlex-e2e");

await mongoose.connect(uri);
await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
const farm = await FarmModel.create({ name: "Fowlex Farms" });
const passwordHash = await bcrypt.hash(E2E_PASSWORD, 4); // Low cost: test data only.
await UserModel.create(Object.values(E2E_USERS).map((u) => ({ ...u, farmId: farm._id, passwordHash })));
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
    BLOB_READ_WRITE_TOKEN: "",
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
