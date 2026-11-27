import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";

/**
 * The farm's Paystack balance in one mode (live, test or the simulator): where the book starts,
 * how far Paystack's ledger has been read, the balance Paystack last said, and the top-up account
 * the Paystack Dashboard shows for funding it.
 */
const schema = new Schema(
  {
    mode: { type: String, enum: ["live", "test", "simulated"], required: true },
    openedAt: { type: Date, default: null },
    /** The newest Paystack ledger row read; the next sync starts there. */
    readUpTo: { type: Date, default: null },
    syncedAt: { type: Date, default: null },
    paystackBalanceKobo: { type: Number, default: null },
    topUp: {
      type: new Schema(
        {
          bankName: { type: String, required: true },
          accountNumber: { type: String, required: true },
          accountName: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (a) => `Paystack balance (${String(a.mode)})` } });
schema.index({ farmId: 1, mode: 1 }, { unique: true });

export type PaystackAccount = InferSchemaType<typeof schema> & Base;
export const PaystackAccountModel =
  (models.PaystackAccount as Model<PaystackAccount, object, SoftDeleteMethods>) ?? model("PaystackAccount", schema);
