import { type HydratedDocument, type Query, Schema, type Types } from "mongoose";

/** The fields every Fowlex document carries. */
export type Base = {
  farmId: Types.ObjectId;
  createdBy: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SoftDeleteMethods = {
  /** Marks the document deleted. It stays in the database (and the audit trail) but leaves every query. */
  softDelete(): Promise<void>;
  restore(): Promise<void>;
};

/** Query option: `Model.find().setOptions({ withDeleted: true })` includes soft-deleted documents. */
export const WITH_DELETED = { withDeleted: true } as const;

const QUERIES = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndReplace",
  "findOneAndDelete",
  "countDocuments",
  "updateOne",
  "updateMany",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "distinct",
] as const;

/**
 * Adds what every document needs: `farmId` (each farm's data stays its own; `farm: false` for the
 * Farm model itself), `createdBy`, timestamps, and soft delete. Deleted documents are left out of
 * every query and aggregation unless it asks for them with WITH_DELETED, so a deleted expense can't
 * leak into a report.
 */
export function basePlugin(schema: Schema, { farm = true }: { farm?: boolean } = {}) {
  if (farm) schema.add({ farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true, index: true } });
  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    deletedAt: { type: Date, default: null, index: true },
  });
  schema.set("timestamps", true);

  function hideDeleted(this: Query<unknown, unknown>) {
    if (this.getOptions().withDeleted) return;
    if ("deletedAt" in this.getFilter()) return; // The query says what it wants.
    this.where({ deletedAt: null });
  }
  for (const op of QUERIES) schema.pre(op, hideDeleted);

  schema.pre("aggregate", function () {
    if (this.options.withDeleted) return;
    this.pipeline().unshift({ $match: { deletedAt: null } });
  });

  schema.method("softDelete", async function (this: HydratedDocument<Base>) {
    this.deletedAt = new Date();
    await this.save();
  });
  schema.method("restore", async function (this: HydratedDocument<Base>) {
    this.deletedAt = null;
    await this.save();
  });
}
