import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { CUSTOMER_TYPES } from "@/lib/customers/rules";

/**
 * A buyer: a restaurant, lounge or hotel the farm sells to in bulk, or anyone else. Carries how
 * long they have to pay and the most they may owe, and the portal login they see their invoices
 * with (step 6.7).
 */
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: CUSTOMER_TYPES, required: true },
    contactName: { type: String, trim: true, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    address: { type: String, trim: true, default: "" },
    creditLimitKobo: { type: Number, default: null, min: 0 },
    termsDays: { type: Number, required: true, min: 0, max: 365 },
    notes: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["active", "archived"], default: "active" },
    /** The customer's portal login, once they've been invited. */
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    /** The farm's one account for buyers who give no details: sales and invoices never wait for a customer. */
    walkIn: { type: Boolean, default: false },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (c) => String(c.name) } });
schema.index({ farmId: 1, status: 1, name: 1 });
schema.index({ farmId: 1, walkIn: 1 }, { unique: true, partialFilterExpression: { walkIn: true } });
schema.index({ userId: 1 }, { partialFilterExpression: { userId: { $type: "objectId" } } });

export type Customer = InferSchemaType<typeof schema> & Base;
export const CustomerModel =
  (models.Customer as Model<Customer, object, SoftDeleteMethods>) ?? model("Customer", schema);
