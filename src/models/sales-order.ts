import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { PRICINGS } from "@/lib/contracts/rules";
import { ORDER_STATUSES } from "@/lib/sales/rules";

/**
 * Birds a customer buys: from which batches, how many, their weight and price, the delivery day
 * and charge. Delivered, the birds leave their batch's live count; invoiced, it's on an invoice.
 * The price comes from the customer's contract on the delivery day when one runs.
 */
const schema = new Schema(
  {
    number: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    /** The contract that priced it, if one ran on the delivery day. */
    contractId: { type: Schema.Types.ObjectId, ref: "Contract", default: null },
    deliveryDate: { type: String, required: true },
    lines: {
      type: [
        new Schema(
          {
            batchId: { type: Schema.Types.ObjectId, ref: "Batch", required: true },
            birds: { type: Number, required: true, min: 1 },
            weightGrams: { type: Number, default: 0, min: 0 },
            priceKobo: { type: Number, required: true, min: 1 },
            pricing: { type: String, enum: PRICINGS, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    deliveryKobo: { type: Number, default: 0, min: 0 },
    totalKobo: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, default: "" },
    status: { type: String, enum: ORDER_STATUSES, default: "pending" },
    deliveredOn: { type: String, default: null },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (o) => String(o.number) } });
schema.index({ farmId: 1, number: 1 }, { unique: true });
schema.index({ farmId: 1, customerId: 1, status: 1 });
schema.index({ farmId: 1, "lines.batchId": 1, status: 1 });

export type SalesOrder = InferSchemaType<typeof schema> & Base;
export const SalesOrderModel =
  (models.SalesOrder as Model<SalesOrder, object, SoftDeleteMethods>) ?? model("SalesOrder", schema);
