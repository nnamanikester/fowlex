import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";

/**
 * A forgot-password link. Only the SHA-256 of its token is stored, so a database leak can't be
 * used to reset anyone's password. Single use; MongoDB drops it a day after it expires.
 */
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
});
schema.plugin(basePlugin);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export type PasswordReset = InferSchemaType<typeof schema> & Base;

export const PasswordResetModel =
  (models.PasswordReset as Model<PasswordReset, object, SoftDeleteMethods>) ?? model("PasswordReset", schema);
