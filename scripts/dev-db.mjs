// A local MongoDB for `yarn dev` until Atlas is set up: a single-node replica set (so transactions
// work, as on Atlas) on port 27017, keeping its data in .data/mongo between runs.
//
//   yarn db      # leave it running, then in .env.local:
//   MONGODB_URI=mongodb://127.0.0.1:27017/fowlex-dev?replicaSet=fowlex
import { mkdirSync } from "node:fs";

import { MongoMemoryReplSet } from "mongodb-memory-server";

const dbPath = new URL("../.data/mongo", import.meta.url).pathname;
mkdirSync(dbPath, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: "fowlex", count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ port: 27017, dbPath }],
});

console.log("MongoDB is running. Put this in .env.local:\n");
console.log(`MONGODB_URI=${replSet.getUri("fowlex-dev")}\n`);
console.log("Ctrl+C to stop (the data stays in .data/mongo).");

const stop = async () => {
  await replSet.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
