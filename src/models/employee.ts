import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { PAY_TYPES } from "@/lib/people/rules";

/**
 * Someone who works on the farm and is paid: by the month, by the day (attendance), or per batch.
 * Their bank account, checked with the bank, carries the Paystack recipient their pay goes to.
 */
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    job: { type: String, trim: true, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    address: { type: String, trim: true, default: "" },
    nextOfKinName: { type: String, trim: true, default: "" },
    nextOfKinPhone: { type: String, default: "" },
    startDate: { type: String, required: true },
    payType: { type: String, enum: PAY_TYPES, required: true },
    rateKobo: { type: Number, required: true, min: 1 },
    batchIds: { type: [{ type: Schema.Types.ObjectId, ref: "Batch" }], default: [] },
    notes: { type: String, trim: true, default: "" },
    bank: {
      type: new Schema(
        {
          bankCode: { type: String, required: true },
          bankName: { type: String, default: "" },
          accountNumber: { type: String, required: true },
          accountName: { type: String, required: true },
          recipientCode: { type: String, default: null },
          verifiedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    /** Working here, or left (kept for history; not in new payroll runs). */
    status: { type: String, enum: ["active", "left"], default: "active" },
    leftOn: { type: String, default: null },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (e) => String(e.name) } });
schema.index({ farmId: 1, status: 1, name: 1 });

export type Employee = InferSchemaType<typeof schema> & Base;
export const EmployeeModel =
  (models.Employee as Model<Employee, object, SoftDeleteMethods>) ?? model("Employee", schema);
