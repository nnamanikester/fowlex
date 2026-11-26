import "server-only";

import mongoose, { type ClientSession } from "mongoose";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

// One connection per server process, kept on globalThis so hot reloads in development and warm
// serverless invocations reuse it instead of opening a new pool each time.
const g = globalThis as typeof globalThis & { __fowlexDb?: Cache };
const cache = (g.__fowlexDb ??= { conn: null, promise: null });

/** Connects once and returns the shared connection. Every data function calls this first. */
export async function connectDb() {
  if (cache.conn) return cache.conn;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.");
  cache.promise ??= mongoose.connect(uri, {
    // Fail fast instead of queueing queries while disconnected.
    bufferCommands: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
  return cache.conn;
}

/** For tests: close the shared connection so the next connectDb() starts afresh. */
export async function disconnectDb() {
  if (cache.promise) await (await cache.promise).disconnect();
  cache.conn = null;
  cache.promise = null;
}

/**
 * Runs `fn` in a transaction: every write that passes `session` commits together or not at all
 * (a purchase and its stock movements, a payment and its invoice). Retries on transient errors,
 * so `fn` must be safe to run more than once. Needs a replica set, which Atlas always is.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const { connection } = await connectDb();
  return connection.transaction(fn);
}
