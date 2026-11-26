/**
 * Builds every model's collection and indexes in the database MONGODB_URI points at. Runs on every
 * Vercel deploy (the vercel-build script) because production doesn't build indexes at runtime.
 *
 *   yarn db:indexes
 */
import mongoose from "mongoose";

import { ensureIndexes } from "../src/models/index";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Fine on Vercel: the variables come from the environment.
}

if (!process.env.MONGODB_URI) {
  console.warn("MONGODB_URI is not set: skipping indexes. Set it for this environment in Vercel.");
  process.exit(0);
}

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
const built = await ensureIndexes();
await mongoose.disconnect();
console.log(`Indexes ready: ${built.join(", ")}.`);
