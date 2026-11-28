import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";

/**
 * A one-off bank account Paystack made for paying one invoice ("Pay with Transfer"): the account
 * to show, the amount and when it stops working. When the money lands (webhook or a check), the
 * payment is recorded on the invoice once.
 */
const schema = new Schema({
  /** A one-off bank account (transfer), or Paystack's checkout page (card, bank app, USSD). */
  kind: { type: String, enum: ["transfer", "checkout"], default: "transfer" },
  invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
  reference: { type: String, required: true },
  amountKobo: { type: Number, required: true, min: 1 },
  /** The email Paystack was given: the customer's, or one made from the invoice number. */
  email: { type: String, required: true },
  accountNumber: { type: String, default: "" },
  accountName: { type: String, default: "" },
  bankName: { type: String, default: "" },
  /** When a transfer account stops working; checkouts don't run out. */
  expiresAt: { type: Date, default: null },
  /** Where the customer pays, for a checkout. */
  authorizationUrl: { type: String, default: "" },
  /** What Paystack kept for taking it, once paid: booked as a bank charge. */
  feeKobo: { type: Number, default: 0 },
  status: { type: String, enum: ["waiting", "paid", "expired"], default: "waiting" },
  paidAt: { type: Date, default: null },
  paymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
});
schema.plugin(basePlugin, { audit: { label: (c) => String(c.reference) } });
schema.index({ reference: 1 }, { unique: true });
schema.index({ farmId: 1, invoiceId: 1, status: 1 });

export type Collection = InferSchemaType<typeof schema> & Base;
export const CollectionModel =
  (models.Collection as Model<Collection, object, SoftDeleteMethods>) ?? model("Collection", schema);
