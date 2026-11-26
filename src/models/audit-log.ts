import { type InferSchemaType, model, models, Schema, type Model, type Types } from "mongoose";

/**
 * One change to one record: who (or the system), what (create, update, delete, restore), which
 * record, and the before and after values of each field that changed. Append-only: never edited,
 * never deleted, so it has no soft delete of its own.
 */
const schema = new Schema(
  {
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, default: "System" },
    action: { type: String, enum: ["create", "update", "delete", "restore"], required: true },
    model: { type: String, required: true },
    docId: { type: Schema.Types.ObjectId, required: true },
    label: { type: String, default: "" },
    changes: [
      {
        _id: false,
        field: { type: String, required: true },
        before: { type: Schema.Types.Mixed, default: null },
        after: { type: Schema.Types.Mixed, default: null },
      },
    ],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ farmId: 1, createdAt: -1 });
schema.index({ farmId: 1, model: 1, docId: 1 });

export type AuditLog = InferSchemaType<typeof schema> & { _id: Types.ObjectId; createdAt: Date };
export type AuditChange = { field: string; before: unknown; after: unknown };

export const AuditLogModel = (models.AuditLog as Model<AuditLog>) ?? model("AuditLog", schema);
