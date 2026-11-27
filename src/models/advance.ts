import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";

/**
 * Money given to someone ahead of their pay: recorded as a labour expense when given, and taken
 * back from their pay over `months`, starting with `firstPeriod`'s. Each payroll run's deduction is
 * kept in `repayments`.
 */
const schema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    date: { type: String, required: true },
    amountKobo: { type: Number, required: true, min: 1 },
    months: { type: Number, required: true, min: 1 },
    firstPeriod: { type: String, required: true },
    reason: { type: String, trim: true, default: "" },
    repayments: {
      type: [
        new Schema(
          {
            period: { type: String, required: true },
            amountKobo: { type: Number, required: true, min: 0 },
            runId: { type: Schema.Types.ObjectId, ref: "PayrollRun", required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (a) => `${String(a.date)} ${String(a.amountKobo)}` } });
schema.index({ farmId: 1, employeeId: 1, date: -1 });

export type Advance = InferSchemaType<typeof schema> & Base;
export const AdvanceModel = (models.Advance as Model<Advance, object, SoftDeleteMethods>) ?? model("Advance", schema);
