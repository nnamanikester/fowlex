import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { SUPPLIES } from "@/lib/suppliers/rules";

/**
 * Who the farm buys from or pays: hatcheries, feed mills, drug stores, transporters, vets. A bank
 * account, once checked with the bank, carries the Paystack recipient code payments go to.
 */
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true },
    supplies: { type: [{ type: String, enum: SUPPLIES }], default: [] },
    contactName: { type: String, trim: true, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    address: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    bank: {
      type: new Schema(
        {
          bankCode: { type: String, required: true },
          bankName: { type: String, default: "" },
          accountNumber: { type: String, required: true },
          accountName: { type: String, required: true },
          /** Paystack's code for paying this account; null until Paystack has made one. */
          recipientCode: { type: String, default: null },
          verifiedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    archived: { type: Boolean, default: false },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (s) => String(s.name), exclude: ["nameKey"] } });
schema.index({ farmId: 1, nameKey: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

export type Supplier = InferSchemaType<typeof schema> & Base;
export const SupplierModel =
  (models.Supplier as Model<Supplier, object, SoftDeleteMethods>) ?? model("Supplier", schema);
