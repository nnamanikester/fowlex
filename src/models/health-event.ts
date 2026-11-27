import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { HEALTH_KINDS } from "@/lib/health/rules";

/** A vaccination, a course of medication or a vet's visit to a batch. */
const schema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: "Batch", required: true },
    date: { type: String, required: true },
    kind: { type: String, enum: HEALTH_KINDS, required: true },
    product: { type: String, trim: true, default: "" },
    /** The programme dose this vaccination counts as, e.g. "nd-1". */
    scheduleKey: { type: String, default: null },
    route: { type: String, trim: true, default: "" },
    dose: { type: String, trim: true, default: "" },
    givenBy: { type: String, trim: true, default: "" },
    costKobo: { type: Number, default: 0, min: 0 },
    /** Taken from stock: the item and how many. Its cost is the stock's average, not `costKobo`. */
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", default: null },
    quantity: { type: Number, default: null, min: 0 },
    /** Days birds can't be sold for meat after this drug. */
    withdrawalDays: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true, default: "" },
    clientRequestId: { type: String, default: null },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, {
  audit: { label: (e) => `${String(e.kind)} ${String(e.date)}`, exclude: ["clientRequestId"] },
});
// Each programme dose is recorded once per batch.
schema.index(
  { batchId: 1, scheduleKey: 1 },
  { unique: true, partialFilterExpression: { scheduleKey: { $type: "string" }, deletedAt: null } },
);
schema.index(
  { farmId: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } },
);
schema.index({ farmId: 1, batchId: 1, date: -1 });

export type HealthEvent = InferSchemaType<typeof schema> & Base;
export const HealthEventModel =
  (models.HealthEvent as Model<HealthEvent, object, SoftDeleteMethods>) ?? model("HealthEvent", schema);
