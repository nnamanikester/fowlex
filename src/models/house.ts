import { type HydratedDocument, type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { HOUSE_STATUSES, HOUSE_SYSTEMS, HOUSE_VENTILATION } from "@/lib/houses/rules";

/**
 * A poultry house (pen): where batches are placed. Capacity is in birds. `nameKey` is the name
 * lowercased with spaces collapsed, so "House 1" and "house  1" can't both exist. A house with
 * batches is retired, not deleted, so its history keeps its name.
 */
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true },
    capacity: { type: Number, required: true, min: 1 },
    floorAreaSqm: { type: Number, default: null, min: 0 },
    system: { type: String, enum: HOUSE_SYSTEMS, default: "deep-litter" },
    ventilation: { type: String, enum: HOUSE_VENTILATION, default: "open-sided" },
    status: { type: String, enum: HOUSE_STATUSES, default: "active" },
    notes: { type: String, trim: true, default: "" },
  },
  // Two people editing the same house: the second save is refused rather than overwriting.
  { optimisticConcurrency: true },
);
schema.plugin(basePlugin, { audit: { label: (h) => String(h.name), exclude: ["nameKey"] } });
schema.index({ farmId: 1, nameKey: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

export type House = InferSchemaType<typeof schema> & Base;
export type HouseDocument = HydratedDocument<House, SoftDeleteMethods>;

export const HouseModel = (models.House as Model<House, object, SoftDeleteMethods>) ?? model("House", schema);
