import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { CONTRACT_STATUSES, DELIVERY_EVERY, MIN_PER, PRICINGS } from "@/lib/contracts/rules";

/** The terms a contract agrees, which a template can hold too. */
const terms = {
  pricing: { type: String, enum: PRICINGS, required: true },
  priceKobo: { type: Number, required: true, min: 1 },
  minBirds: { type: Number, default: null, min: 1 },
  minPer: { type: String, enum: MIN_PER, default: "week" },
  deliveryEvery: { type: String, enum: DELIVERY_EVERY, required: true },
  termsDays: { type: Number, required: true, min: 0, max: 365 },
};

/**
 * What was agreed with a customer: the price per kg or per bird, how many birds and how often,
 * how long they have to pay, and for how long. An active contract sets the price of the
 * customer's orders while it runs; the signed copy can be attached.
 */
const schema = new Schema(
  {
    number: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    ...terms,
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    reviewOn: { type: String, default: null },
    notes: { type: String, trim: true, default: "" },
    document: {
      type: new Schema({ url: { type: String, required: true }, name: { type: String, default: "" } }, { _id: false }),
      default: null,
    },
    status: { type: String, enum: CONTRACT_STATUSES, default: "draft" },
    terminatedOn: { type: String, default: null },
    /** When the farm was told it's ending soon, so it's said once. */
    endingWarnedAt: { type: Date, default: null },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (c) => String(c.number) } });
schema.index({ farmId: 1, number: 1 }, { unique: true });
schema.index({ farmId: 1, customerId: 1, status: 1 });

export type Contract = InferSchemaType<typeof schema> & Base;
export const ContractModel =
  (models.Contract as Model<Contract, object, SoftDeleteMethods>) ?? model("Contract", schema);

/** Terms kept to start a new contract from: one tap fills the price, minimum, deliveries and payment terms. */
const templateSchema = new Schema({
  name: { type: String, required: true, trim: true },
  ...terms,
  /** How long a contract from it runs. */
  months: { type: Number, required: true, min: 1, max: 60 },
});
templateSchema.plugin(basePlugin, { audit: { label: (t) => String(t.name) } });

export type ContractTemplate = InferSchemaType<typeof templateSchema> & Base;
export const ContractTemplateModel =
  (models.ContractTemplate as Model<ContractTemplate, object, SoftDeleteMethods>) ??
  model("ContractTemplate", templateSchema);
