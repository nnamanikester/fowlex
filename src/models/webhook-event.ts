import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

/** Each Paystack webhook, kept once: a repeat of one already handled is skipped. */
const schema = new Schema(
  {
    key: { type: String, required: true },
    event: { type: String, required: true },
    reference: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, required: true },
    handledAt: { type: Date, default: null },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);
schema.index({ key: 1 }, { unique: true });

export type WebhookEvent = InferSchemaType<typeof schema>;
export const WebhookEventModel = (models.WebhookEvent as Model<WebhookEvent>) ?? model("WebhookEvent", schema);
