import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";

/**
 * A change to an agreed contract. Asked for by anyone who writes contracts, it changes nothing
 * until an owner approves it; an owner's own change is approved as it's made. Every one stays on
 * the contract's record, with what the terms were and what they became.
 */
const schema = new Schema({
  contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true },
  /** The terms as they were when it was asked for, and as they would be: only what differs. */
  before: { type: Schema.Types.Mixed, required: true },
  after: { type: Schema.Types.Mixed, required: true },
  reason: { type: String, trim: true, default: "" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, trim: true, default: "" },
});
schema.plugin(basePlugin, { audit: { label: () => "Contract change" } });
schema.index({ farmId: 1, contractId: 1, status: 1 });

export type ContractChange = InferSchemaType<typeof schema> & Base;
export const ContractChangeModel =
  (models.ContractChange as Model<ContractChange, object, SoftDeleteMethods>) ?? model("ContractChange", schema);
