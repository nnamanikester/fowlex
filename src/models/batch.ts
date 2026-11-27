import { type HydratedDocument, type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { BATCH_STATUSES, BATCH_TYPES, DEFAULTS } from "@/lib/batches/rules";

/**
 * A batch (flock): one group of chicks placed together in a house, followed until sale. Its code
 * (B-2026-07) never changes. Counts are birds, money kobo, weight grams, dates Lagos days. Live
 * birds start as delivered less dead on arrival; daily logs (2.3) and sales (6.3) move them on.
 */
const schema = new Schema(
  {
    code: { type: String, required: true },
    year: { type: Number, required: true },
    seq: { type: Number, required: true },
    type: { type: String, enum: BATCH_TYPES, default: "broiler" },
    breed: { type: String, required: true, trim: true },
    houseId: { type: Schema.Types.ObjectId, ref: "House", required: true, index: true },
    placedOn: { type: String, required: true },
    ageAtPlacementDays: { type: Number, default: 0, min: 0 },
    delivered: { type: Number, required: true, min: 1 },
    deadOnArrival: { type: Number, default: 0, min: 0 },
    freeExtras: { type: Number, default: 0, min: 0 },
    pricePerChickKobo: { type: Number, required: true, min: 0 },
    supplierName: { type: String, trim: true, default: "" },
    /** The hatchery as a saved supplier, so its chicks can be paid for; null for a name typed in. */
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", default: null },
    /** Chicks booked and paid for ahead of pickup: what was paid for, whatever turns up. */
    bookedChicks: { type: Number, default: null, min: 0 },
    /** False for a booking until the chicks are picked up and placed. */
    pickedUp: { type: Boolean, default: true },
    targetSellAgeDays: { type: Number, default: DEFAULTS.targetSellAgeDays },
    targetWeightGrams: { type: Number, default: DEFAULTS.targetWeightGrams },
    status: { type: String, enum: BATCH_STATUSES, default: "active" },
    closedOn: { type: String, default: null },
    notes: { type: String, trim: true, default: "" },
    /** The client's id for the request that created it: a retried create returns this batch. */
    clientRequestId: { type: String, default: null },
  },
  { optimisticConcurrency: true },
);
schema.plugin(basePlugin, { audit: { label: (b) => String(b.code), exclude: ["clientRequestId", "year", "seq"] } });
schema.index({ farmId: 1, code: 1 }, { unique: true });
schema.index(
  { farmId: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } },
);
schema.index({ farmId: 1, status: 1, placedOn: -1 });

export type Batch = InferSchemaType<typeof schema> & Base;
export type BatchDocument = HydratedDocument<Batch, SoftDeleteMethods>;

export const BatchModel = (models.Batch as Model<Batch, object, SoftDeleteMethods>) ?? model("Batch", schema);
