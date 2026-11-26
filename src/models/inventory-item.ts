import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { CATEGORIES, UNITS } from "@/lib/inventory/rules";

/**
 * Something the farm keeps in stock: feed, drugs, litter, fuel. How much is on hand and what it's
 * worth come from its stock movements (step 3.2), never stored here.
 */
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    unit: { type: String, enum: UNITS, required: true },
    unitKg: { type: Number, default: null, min: 0 },
    reorderLevel: { type: Number, default: null, min: 0 },
    notes: { type: String, trim: true, default: "" },
    /** Hidden from new purchases and logs, kept for history. */
    archived: { type: Boolean, default: false },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (i) => String(i.name), exclude: ["nameKey"] } });
schema.index({ farmId: 1, nameKey: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

export type InventoryItem = InferSchemaType<typeof schema> & Base;
export const InventoryItemModel =
  (models.InventoryItem as Model<InventoryItem, object, SoftDeleteMethods>) ?? model("InventoryItem", schema);
