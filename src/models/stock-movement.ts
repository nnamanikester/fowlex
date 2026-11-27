import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { MOVEMENT_TYPES } from "@/lib/inventory/stock";

/**
 * Units of an item coming in (opening stock, a purchase, a count that finds more) or going out
 * (usage, a count that finds less). Stock on hand and its value are replayed from these.
 */
const schema = new Schema({
  itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
  type: { type: String, enum: MOVEMENT_TYPES, required: true },
  date: { type: String, required: true },
  quantity: { type: Number, required: true },
  unitCostKobo: { type: Number, default: null, min: 0 },
  /** The batch the units went to, for usage charged to a batch. */
  batchId: { type: Schema.Types.ObjectId, ref: "Batch", default: null },
  /** The record that made this movement: a daily log's feed, a purchase line. */
  source: {
    kind: { type: String, enum: ["daily-log", "purchase", "health", null], default: null },
    id: { type: Schema.Types.ObjectId, default: null },
  },
  notes: { type: String, trim: true, default: "" },
});

schema.plugin(basePlugin, { audit: { label: (m) => `${String(m.type)} ${String(m.quantity)}` } });
schema.index({ farmId: 1, itemId: 1, date: 1 });
schema.index({ farmId: 1, batchId: 1 });
// A daily log takes its feed off once. (A purchase can list one item on several lines.)
schema.index(
  { "source.kind": 1, "source.id": 1, itemId: 1 },
  { unique: true, partialFilterExpression: { "source.kind": "daily-log", deletedAt: null } },
);

export type StockMovement = InferSchemaType<typeof schema> & Base;
export const StockMovementModel =
  (models.StockMovement as Model<StockMovement, object, SoftDeleteMethods>) ?? model("StockMovement", schema);
