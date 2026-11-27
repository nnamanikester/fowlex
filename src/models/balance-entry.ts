import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { CHANNELS, DIRECTIONS, ENTRY_CATEGORIES, ENTRY_STATUSES } from "@/lib/balance/rules";

/**
 * One movement in or out of the Paystack balance, with everything an auditor asks: what, how much,
 * which way, the balance after, who started it and how, the account on the other side, Paystack's
 * own ids to find it there, and the expense or payout behind it.
 */
const schema = new Schema(
  {
    /** live or test keys, or the simulator: each has its own balance, never mixed. */
    mode: { type: String, enum: ["live", "test", "simulated"], required: true },
    /** One per movement: `ledger:<id>` for Paystack's ledger rows, `payout:<ref>:<kind>` for Fowlex's. */
    key: { type: String, required: true },
    direction: { type: String, enum: DIRECTIONS, required: true },
    category: { type: String, enum: ENTRY_CATEGORIES, required: true },
    amountKobo: { type: Number, required: true, min: 0 },
    /** Paystack's balance right after it, once its ledger shows it. */
    balanceAfterKobo: { type: Number, default: null },
    status: { type: String, enum: ENTRY_STATUSES, default: "confirmed" },
    occurredAt: { type: Date, required: true },
    description: { type: String, default: "" },
    channel: { type: String, enum: CHANNELS, required: true },
    /** Who pressed the button in Fowlex (also in createdBy), by name as it was then. */
    initiatedByName: { type: String, default: "" },
    counterparty: {
      type: new Schema(
        {
          name: { type: String, default: "" },
          bankName: { type: String, default: "" },
          accountNumber: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: null,
    },
    expenseId: { type: Schema.Types.ObjectId, ref: "Expense", default: null },
    payoutId: { type: Schema.Types.ObjectId, ref: "Payout", default: null },
    paystack: {
      ledgerId: { type: String, default: null },
      reference: { type: String, default: null },
      transferCode: { type: String, default: null },
      transferId: { type: String, default: null },
      model: { type: String, default: "" },
      modelRow: { type: String, default: null },
      reason: { type: String, default: "" },
      /** Paystack's ledger row as it came, for the record. */
      raw: { type: Schema.Types.Mixed, default: null },
    },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (e) => String(e.description || e.key) } });
schema.index({ farmId: 1, mode: 1, key: 1 }, { unique: true });
// A Paystack ledger row is booked once, whether it confirmed Fowlex's entry or came in on its own.
schema.index(
  { farmId: 1, mode: 1, "paystack.ledgerId": 1 },
  { unique: true, partialFilterExpression: { "paystack.ledgerId": { $type: "string" } } },
);
schema.index({ farmId: 1, mode: 1, occurredAt: -1 });

export type BalanceEntry = InferSchemaType<typeof schema> & Base;
export const BalanceEntryModel =
  (models.BalanceEntry as Model<BalanceEntry, object, SoftDeleteMethods>) ?? model("BalanceEntry", schema);
