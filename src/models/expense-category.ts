import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";

/**
 * A farm's own expense category, or its changes to a built-in one (a new name, a budget). The key
 * is what expenses keep; it never changes.
 */
const schema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true },
    monthlyBudgetKobo: { type: Number, default: null, min: 0 },
    builtIn: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (c) => String(c.name), exclude: ["nameKey"] } });
schema.index({ farmId: 1, key: 1 }, { unique: true });

export type ExpenseCategory = InferSchemaType<typeof schema> & Base;
export const ExpenseCategoryModel =
  (models.ExpenseCategory as Model<ExpenseCategory, object, SoftDeleteMethods>) ?? model("ExpenseCategory", schema);
