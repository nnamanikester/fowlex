import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";

const money = { type: Number, required: true, min: 0 };

/**
 * A month's pay. While a draft, each person's pay is worked out afresh (attendance, batches,
 * advances) and only `adjustments` are kept. Approving freezes it into `lines`, each a payslip with
 * its own labour expense to pay.
 */
const schema = new Schema(
  {
    number: { type: String, required: true },
    period: { type: String, required: true },
    status: { type: String, enum: ["draft", "approved"], default: "draft" },
    adjustments: {
      type: [
        new Schema(
          {
            employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
            bonusKobo: { type: Number, default: 0 },
            deductionKobo: { type: Number, default: 0 },
            deductionNote: { type: String, default: "" },
            excluded: { type: Boolean, default: false },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    lines: {
      type: [
        new Schema({
          employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
          name: { type: String, required: true },
          job: { type: String, default: "" },
          payType: { type: String, required: true },
          rateKobo: money,
          units: { type: Number, required: true },
          basis: { type: String, default: "" },
          grossKobo: money,
          bonusKobo: money,
          deductionKobo: money,
          deductionNote: { type: String, default: "" },
          advances: {
            type: [new Schema({ advanceId: Schema.Types.ObjectId, amountKobo: Number }, { _id: false })],
            default: [],
          },
          advanceKobo: money,
          netKobo: money,
          excluded: { type: Boolean, default: false },
          hasBank: { type: Boolean, default: false },
          batchIds: { type: [Schema.Types.ObjectId], default: [] },
          /** When the payslip was last emailed to them. */
          emailedAt: { type: Date, default: null },
        }),
      ],
      default: [],
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (r) => String(r.number) } });
schema.index({ farmId: 1, period: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

export type PayrollRun = InferSchemaType<typeof schema> & Base;
export const PayrollRunModel =
  (models.PayrollRun as Model<PayrollRun, object, SoftDeleteMethods>) ?? model("PayrollRun", schema);
