import { type HydratedDocument, type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { basePlugin, type SoftDeleteMethods } from "./plugins/base";

/**
 * A farm: the owner of every other document (they all carry `farmId`). Fowlex runs one farm today;
 * the field is there so a second one never means a migration. Its settings live in Settings (1.11).
 */
const schema = new Schema({
  name: { type: String, required: true, trim: true },
});
schema.plugin(basePlugin, { farm: false });

export type Farm = InferSchemaType<typeof schema>;
export type FarmDocument = HydratedDocument<Farm, SoftDeleteMethods>;

// Reuse the compiled model across hot reloads.
export const FarmModel = (models.Farm as Model<Farm, object, SoftDeleteMethods>) ?? model("Farm", schema);
