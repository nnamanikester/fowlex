import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { ATTENDANCE } from "@/lib/people/attendance-rules";

/** Whether someone paid by the day came on a day. One per person per day; unmarked is `null`. */
const schema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    date: { type: String, required: true },
    status: { type: String, enum: [...ATTENDANCE, null], default: null },
  },
  { optimisticConcurrency: true },
);

schema.plugin(basePlugin, { audit: { label: (a) => `${String(a.date)} ${String(a.status)}` } });
schema.index({ employeeId: 1, date: 1 }, { unique: true });
schema.index({ farmId: 1, date: 1 });

export type AttendanceRecord = InferSchemaType<typeof schema> & Base;
export const AttendanceModel =
  (models.Attendance as Model<AttendanceRecord, object, SoftDeleteMethods>) ?? model("Attendance", schema);
