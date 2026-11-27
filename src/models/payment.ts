import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { PAYMENT_METHODS } from "@/lib/payments/rules";

/**
 * Money a customer paid against an invoice: how much, how and when, with the bank or Paystack
 * reference. An invoice can be paid in parts; its `paidKobo` is the sum of these.
 */
const schema = new Schema({
  invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
  customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
  amountKobo: { type: Number, required: true, min: 1 },
  method: { type: String, enum: PAYMENT_METHODS, required: true },
  reference: { type: String, trim: true, default: "" },
  date: { type: String, required: true },
  notes: { type: String, trim: true, default: "" },
});

schema.plugin(basePlugin, { audit: { label: (p) => `Payment of ${String(p.amountKobo)} kobo` } });
schema.index({ farmId: 1, invoiceId: 1 });
schema.index({ farmId: 1, customerId: 1, date: 1 });

export type Payment = InferSchemaType<typeof schema> & Base;
export const PaymentModel = (models.Payment as Model<Payment, object, SoftDeleteMethods>) ?? model("Payment", schema);
