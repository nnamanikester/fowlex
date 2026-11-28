import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

import { type Base, basePlugin, type SoftDeleteMethods } from "./plugins/base";

/**
 * One per farm: the business details on invoices, how invoices are numbered and paid, the expense
 * approval limit, default pricing, VAT and how shared costs are split. Created with these defaults
 * the first time it's read. Money is in kobo.
 */
const schema = new Schema({
  businessName: { type: String, trim: true, default: "Fowlex Farms" },
  address: { type: String, trim: true, default: "" },
  phone: { type: String, trim: true, default: "" },
  email: { type: String, trim: true, lowercase: true, default: "" },
  logoUrl: { type: String, default: null },

  invoicePrefix: { type: String, trim: true, uppercase: true, default: "INV" },
  /** The number the next invoice gets; taken atomically by nextInvoiceNumber(). */
  nextInvoiceNumber: { type: Number, default: 1, min: 1 },
  paymentTermsDays: { type: Number, default: 14, min: 0, max: 365 },
  vatEnabled: { type: Boolean, default: false },
  /** In basis points: 750 is 7.5%, Nigeria's VAT rate. */
  vatRateBps: { type: Number, default: 750, min: 0, max: 10_000 },
  bankName: { type: String, trim: true, default: "" },
  accountNumber: { type: String, trim: true, default: "" },
  accountName: { type: String, trim: true, default: "" },

  /** Expenses above this need an owner's approval before they count (step 4.3). ₦100,000. */
  expenseApprovalLimitKobo: { type: Number, default: 10_000_000, min: 0 },
  /** The price per kg a sale starts from when no contract sets one. Null until set. */
  defaultPricePerKgKobo: { type: Number, default: null, min: 0 },
  /** How shared costs are split across batches (step 8.2). Bird-days is the only method so far. */
  overheadMethod: { type: String, enum: ["bird-days"], default: "bird-days" },

  /** Birds per m² a house's capacity is suggested from: 10 suits open-sided houses in Nigeria. */
  stockingDensity: { type: Number, default: 10, min: 1, max: 40 },
  /** Days a house rests after a batch leaves, for cleaning, disinfection and downtime. */
  houseRestDays: { type: Number, default: 14, min: 0, max: 120 },

  /** The public order page: customers see what's ready and order (Sales manages it, not this form). */
  shopEnabled: { type: Boolean, default: false },
  /** The page's address, /order/<slug>; set the first time it's turned on. */
  shopSlug: { type: String, default: null },
  /** Whether customers can ask for delivery, or only collect from the farm. */
  shopDelivers: { type: Boolean, default: true },
  /**
   * The farm's prices, the usual one first: each named, per bird or per kg. The order page shows
   * them all; new orders and "Sell now" start from the first.
   */
  prices: {
    type: [
      {
        name: { type: String, trim: true, required: true, maxlength: 40 },
        pricing: { type: String, enum: ["perKg", "perBird"], required: true },
        priceKobo: { type: Number, required: true, min: 1 },
      },
    ],
    default: [],
  },
});
schema.index({ shopSlug: 1 }, { unique: true, partialFilterExpression: { shopSlug: { $type: "string" } } });
schema.plugin(basePlugin, {
  uniquePerFarm: true,
  audit: { label: (s) => String(s.businessName) },
});

export type Settings = InferSchemaType<typeof schema> & Base;

export const SettingsModel =
  (models.Settings as Model<Settings, object, SoftDeleteMethods>) ?? model("Settings", schema);
