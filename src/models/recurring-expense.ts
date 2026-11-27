import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";

/**
 * An expense that repeats every month (rent, security, internet): each month's is made on its due
 * day, waiting for an owner's approval, owed until paid.
 */
const schema = new Schema(
  {
    category: { type: String, required: true },
    description: { type: String, trim: true, required: true },
    amountKobo: { type: Number, required: true, min: 1 },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", default: null },
    payeeName: { type: String, trim: true, default: "" },
    /** The day of the month it's due (1–31; the last day in shorter months). */
    dayOfMonth: { type: Number, required: true, min: 1, max: 31 },
    nextDue: { type: String, required: true },
    active: { type: Boolean, default: true },
    lastMadeOn: { type: String, default: null },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (r) => String(r.description) } });
schema.index({ active: 1, nextDue: 1 });
schema.index({ farmId: 1 });

export type RecurringExpense = InferSchemaType<typeof schema> & Base;
export const RecurringExpenseModel =
  (models.RecurringExpense as Model<RecurringExpense, object, SoftDeleteMethods>) ?? model("RecurringExpense", schema);
