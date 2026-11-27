import { type HydratedDocument, type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";

/**
 * One batch's day: birds that died, were culled or left for sale, feed and water used, and an
 * average weight when the birds were weighed. One per batch per day (Lagos calendar days). Feed in
 * kg, water in litres, weight in grams.
 */
const schema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: "Batch", required: true },
    date: { type: String, required: true },
    deaths: { type: Number, default: 0, min: 0 },
    culls: { type: Number, default: 0, min: 0 },
    sold: { type: Number, default: 0, min: 0 },
    feedKg: { type: Number, default: 0, min: 0 },
    feedType: { type: String, trim: true, default: "" },
    feedItemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", default: null },
    waterLitres: { type: Number, default: null, min: 0 },
    avgWeightGrams: { type: Number, default: null, min: 0 },
    notes: { type: String, trim: true, default: "" },
    /** The phone's id for the request that created it: a resent log returns this one. */
    clientRequestId: { type: String, default: null },
  },
  { optimisticConcurrency: true },
);
schema.plugin(basePlugin, {
  audit: { label: (l) => `Log ${String(l.date)}`, exclude: ["clientRequestId"] },
});
schema.index({ batchId: 1, date: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
schema.index(
  { farmId: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } },
);
schema.index({ farmId: 1, date: -1 });

export type DailyLog = InferSchemaType<typeof schema> & Base;
export type DailyLogDocument = HydratedDocument<DailyLog, SoftDeleteMethods>;

export const DailyLogModel =
  (models.DailyLog as Model<DailyLog, object, SoftDeleteMethods>) ?? model("DailyLog", schema);
