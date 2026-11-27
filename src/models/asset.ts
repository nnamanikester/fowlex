import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { ASSET_KINDS, ASSET_STATUSES } from "@/lib/assets/rules";

/**
 * Equipment that lasts more than a year (a generator, drinkers, cages): its cost is spread over its
 * life as monthly depreciation instead of counting all at once. Bought through Spend money, it
 * carries the expense that paid for it.
 */
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ASSET_KINDS, required: true },
    costKobo: { type: Number, required: true, min: 1 },
    salvageKobo: { type: Number, default: 0, min: 0 },
    purchasedOn: { type: String, required: true },
    usefulLifeMonths: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ASSET_STATUSES, default: "in-use" },
    disposedOn: { type: String, default: null },
    /** What it was sold for, if sold. */
    proceedsKobo: { type: Number, default: 0, min: 0 },
    expenseId: { type: Schema.Types.ObjectId, ref: "Expense", default: null },
    notes: { type: String, trim: true, default: "" },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (a) => String(a.name) } });
schema.index({ farmId: 1, purchasedOn: -1 });
schema.index(
  { expenseId: 1 },
  { unique: true, partialFilterExpression: { expenseId: { $type: "objectId" }, deletedAt: null } },
);

export type Asset = InferSchemaType<typeof schema> & Base;
export const AssetModel = (models.Asset as Model<Asset, object, SoftDeleteMethods>) ?? model("Asset", schema);
