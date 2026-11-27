import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";

export const PAYOUT_STATUSES = ["pending", "otp", "success", "failed", "reversed"] as const;

/**
 * One Paystack transfer: saved (pending) before the money moves, with a reference Paystack
 * refuses to use twice, then settled by Paystack's answer or its webhook, exactly once.
 */
const schema = new Schema(
  {
    expenseId: { type: Schema.Types.ObjectId, ref: "Expense", required: true },
    /** The supplier paid, or null for a bank account paid without saving a supplier. */
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", default: null },
    amountKobo: { type: Number, required: true, min: 1 },
    reference: { type: String, required: true },
    transferCode: { type: String, default: null },
    status: { type: String, enum: PAYOUT_STATUSES, default: "pending" },
    feeKobo: { type: Number, default: 0 },
    /** Who it went to, as it was when sent. */
    recipient: {
      code: { type: String, required: true },
      accountName: { type: String, required: true },
      bankName: { type: String, default: "" },
      accountNumber: { type: String, required: true },
    },
    reason: { type: String, default: "" },
    failure: { type: String, default: "" },
    settledAt: { type: Date, default: null },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (p) => String(p.reference) } });
schema.index({ reference: 1 }, { unique: true });
// One transfer in flight per expense: a second Pay (two taps, two phones) can't start another.
schema.index(
  { expenseId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["pending", "otp"] }, deletedAt: null } },
);

export type Payout = InferSchemaType<typeof schema> & Base;
export const PayoutModel = (models.Payout as Model<Payout, object, SoftDeleteMethods>) ?? model("Payout", schema);
