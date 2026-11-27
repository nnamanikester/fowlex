import { type HydratedDocument, type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";
import { ROLES } from "@/lib/auth/permissions";

/**
 * An invitation to join the farm with a role. The link's token is stored only as its SHA-256; it
 * works once, for seven days, unless a newer invite to the same email or a revoke replaces it.
 * `createdBy` is who sent it. A customer's invite carries the customer it signs in as.
 */
const schema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  role: { type: String, enum: ROLES, required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  /** For the customer portal: the customer this login sees. */
  customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
});
schema.plugin(basePlugin, { audit: { label: (i) => `${i.email}`, redact: ["tokenHash"] } });

export type Invite = InferSchemaType<typeof schema> & Base;
export type InviteDocument = HydratedDocument<Invite, SoftDeleteMethods>;

export const InviteModel = (models.Invite as Model<Invite, object, SoftDeleteMethods>) ?? model("Invite", schema);
