import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { INVOICE_STATES } from "@/lib/invoices/rules";

/**
 * A bill to a customer for delivered orders. Its number is taken when it's made and never reused:
 * an invoice isn't deleted, it's voided (keeping its number) and its orders can be billed again.
 * Payments (step 6.5) add up in `paidKobo`.
 */
const schema = new Schema(
  {
    number: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    orderIds: { type: [{ type: Schema.Types.ObjectId, ref: "SalesOrder" }], default: [] },
    lines: {
      type: [
        new Schema(
          {
            orderId: { type: Schema.Types.ObjectId, ref: "SalesOrder", default: null },
            description: { type: String, required: true },
            amountKobo: { type: Number, required: true, min: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    issueDate: { type: String, required: true },
    dueDate: { type: String, required: true },
    subtotalKobo: { type: Number, required: true, min: 0 },
    discountKobo: { type: Number, default: 0, min: 0 },
    /** VAT at the rate in force when it was made; null when VAT was off. */
    vatRateBps: { type: Number, default: null },
    vatKobo: { type: Number, default: 0, min: 0 },
    totalKobo: { type: Number, required: true, min: 0 },
    paidKobo: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true, default: "" },
    state: { type: String, enum: INVOICE_STATES, default: "draft" },
    sentAt: { type: Date, default: null },
    sentTo: { type: String, default: "" },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: "" },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (i) => String(i.number) } });
schema.index({ farmId: 1, number: 1 }, { unique: true });
schema.index({ farmId: 1, customerId: 1, state: 1 });

export type Invoice = InferSchemaType<typeof schema> & Base;
export const InvoiceModel = (models.Invoice as Model<Invoice, object, SoftDeleteMethods>) ?? model("Invoice", schema);
