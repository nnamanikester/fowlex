import { type HydratedDocument, type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { ROLES } from "@/lib/auth/permissions";

/**
 * Someone who signs in: a partner, a manager, farm staff, or a customer (portal only). The password
 * hash is never selected unless a query asks for it with `.select("+passwordHash")`.
 */
const schema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, select: false, default: null },
  role: { type: String, enum: ROLES, required: true },
  status: { type: String, enum: ["active", "disabled"], default: "active" },
  /** Bumped to end every session at once (password reset, account turned off). */
  sessionVersion: { type: Number, default: 0 },
  failedLogins: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
});
schema.plugin(basePlugin);

export type User = InferSchemaType<typeof schema> & Base;
export type UserDocument = HydratedDocument<User, SoftDeleteMethods>;

export const UserModel = (models.User as Model<User, object, SoftDeleteMethods>) ?? model("User", schema);
