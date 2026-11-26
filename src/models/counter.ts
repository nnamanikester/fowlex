import { type ClientSession, type InferSchemaType, model, models, Schema, type Model } from "mongoose";

/**
 * Named sequences per farm ("batch:2026" → 7). Taken atomically, so two people creating batches at
 * the same moment get different numbers. Bookkeeping, not business data, so it isn't audited.
 */
const schema = new Schema({
  farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
  key: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
schema.index({ farmId: 1, key: 1 }, { unique: true });

export type Counter = InferSchemaType<typeof schema>;
export const CounterModel = (models.Counter as Model<Counter>) ?? model("Counter", schema);

/** The next number in `key` for this farm: 1, 2, 3… */
export async function nextSequence(farmId: string, key: string, session?: ClientSession) {
  const counter = await CounterModel.findOneAndUpdate(
    { farmId, key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", session },
  ).lean();
  return counter!.seq;
}
