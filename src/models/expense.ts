import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { APPROVALS, PAY_METHODS, PAYMENT_STATUSES } from "@/lib/expenses/rules";

/**
 * Money the farm spent or owes: a purchase of stock (with its lines, which raise stock), or any
 * other cost (transport, a vet, repairs). Paid in cash, by a transfer outside Fowlex, or through a
 * Paystack transfer (a Payout), now or later.
 */
const schema = new Schema(
  {
    number: { type: String, required: true },
    date: { type: String, required: true },
    /** A built-in category key ("transport") or one of the farm's own ("c-1a2b3c4d"). */
    category: { type: String, required: true },
    description: { type: String, trim: true, default: "" },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", default: null },
    payeeName: { type: String, trim: true, default: "" },
    /** A bank account paid without saving a supplier: checked with the bank, with its Paystack recipient. */
    payeeBank: {
      type: new Schema(
        {
          bankCode: { type: String, required: true },
          bankName: { type: String, default: "" },
          accountNumber: { type: String, required: true },
          accountName: { type: String, required: true },
          recipientCode: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    batchId: { type: Schema.Types.ObjectId, ref: "Batch", default: null },
    lines: {
      type: [
        new Schema(
          {
            itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
            quantity: { type: Number, required: true, min: 0 },
            unitCostKobo: { type: Number, required: true, min: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    deliveryKobo: { type: Number, default: 0, min: 0 },
    amountKobo: { type: Number, required: true, min: 0 },
    method: { type: String, enum: PAY_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, required: true },
    paidOn: { type: String, default: null },
    /** Only approved expenses count. Above the approval limit, a manager's starts pending. */
    approval: { type: String, enum: APPROVALS, default: "approved" },
    approvalNote: { type: String, trim: true, default: "" },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: "" },
    /** Bought equipment: its cost is spread over its life (depreciation), not counted at once. */
    capital: { type: Boolean, default: false },
    receipt: {
      type: new Schema({ url: { type: String, required: true }, name: { type: String, default: "" } }, { _id: false }),
      default: null,
    },
    /**
     * A cost Fowlex recorded itself: the fee Paystack charged for a transfer, or a batch's chicks
     * (kept in step with the batch).
     */
    source: {
      kind: { type: String, enum: ["payout-fee", "batch", null], default: null },
      id: { type: Schema.Types.ObjectId, default: null },
    },
    clientRequestId: { type: String, default: null },
    /** Made from a monthly repeat, for this month ("2027-01"): each month is made once. */
    recurringId: { type: Schema.Types.ObjectId, ref: "RecurringExpense", default: null },
    period: { type: String, default: null },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, {
  audit: { label: (e) => `${String(e.number)} ${String(e.description)}`, exclude: ["clientRequestId"] },
});
schema.index({ farmId: 1, number: 1 }, { unique: true });
schema.index({ farmId: 1, date: -1 });
schema.index(
  { recurringId: 1, period: 1 },
  { unique: true, partialFilterExpression: { recurringId: { $type: "objectId" }, deletedAt: null } },
);
schema.index({ farmId: 1, supplierId: 1 });
schema.index(
  { farmId: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } },
);
schema.index(
  { "source.kind": 1, "source.id": 1 },
  { unique: true, partialFilterExpression: { "source.id": { $type: "objectId" }, deletedAt: null } },
);

export type Expense = InferSchemaType<typeof schema> & Base;
export const ExpenseModel = (models.Expense as Model<Expense, object, SoftDeleteMethods>) ?? model("Expense", schema);
