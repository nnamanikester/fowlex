// Safe for the browser: no model or database imports here.
import { addDays, isISODate } from "@/lib/dates";

/** How birds are priced under a contract: by the kilogram of live weight, or by the bird. */
export const PRICINGS = ["perKg", "perBird"] as const;
export type Pricing = (typeof PRICINGS)[number];
export const PRICING_LABELS: Record<Pricing, string> = { perKg: "Per kg", perBird: "Per bird" };
export const PER_UNIT: Record<Pricing, string> = { perKg: "a kg", perBird: "a bird" };

export const DELIVERY_EVERY = ["weekly", "fortnightly", "monthly", "as-needed"] as const;
export type DeliveryEvery = (typeof DELIVERY_EVERY)[number];
export const DELIVERY_LABELS: Record<DeliveryEvery, string> = {
  weekly: "Every week",
  fortnightly: "Every two weeks",
  monthly: "Every month",
  "as-needed": "When they order",
};

export const MIN_PER = ["week", "month"] as const;
export type MinPer = (typeof MIN_PER)[number];

/** Draft until it's agreed; active while it runs; ended early by either side. Expired is worked out from the end date. */
export const CONTRACT_STATUSES = ["draft", "active", "terminated"] as const;
export type StoredStatus = (typeof CONTRACT_STATUSES)[number];
export type ContractStatus = StoredStatus | "expired";
export const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft",
  active: "Active",
  expired: "Ended",
  terminated: "Ended early",
};

/** What a contract agrees: the terms a template can hold too. */
export type Terms = {
  pricing: Pricing;
  priceKobo: number;
  /** The fewest birds they take each week or month; null for no minimum. */
  minBirds: number | null;
  minPer: MinPer;
  deliveryEvery: DeliveryEvery;
  termsDays: number;
};

export type ContractInput = Terms & {
  customerId: string;
  startDate: string;
  endDate: string;
  /** When prices can next be reviewed; null if not agreed. */
  reviewOn: string | null;
  notes: string;
  document: { url: string; name: string } | null;
};

export const LIMITS = { kobo: 10_000_000_00, birds: 1_000_000, terms: 365, notes: 1000, name: 80 };

export function validateTerms(v: Partial<Record<keyof Terms, unknown>>) {
  const errors: Partial<Record<keyof Terms, string>> = {};
  if (!PRICINGS.includes(v.pricing as Pricing)) errors.pricing = "Choose per kg or per bird.";
  const price = v.priceKobo;
  if (typeof price !== "number" || !Number.isInteger(price) || price < 1 || price > LIMITS.kobo)
    errors.priceKobo = "Enter the agreed price.";
  const min = v.minBirds;
  if (min !== null && (typeof min !== "number" || !Number.isInteger(min) || min < 1 || min > LIMITS.birds))
    errors.minBirds = "Enter the fewest birds they take, or leave it empty.";
  if (!MIN_PER.includes(v.minPer as MinPer)) errors.minPer = "Choose a week or a month.";
  if (!DELIVERY_EVERY.includes(v.deliveryEvery as DeliveryEvery))
    errors.deliveryEvery = "Choose how often you deliver.";
  const terms = v.termsDays;
  if (typeof terms !== "number" || !Number.isInteger(terms) || terms < 0 || terms > LIMITS.terms)
    errors.termsDays = `Enter 0 (pay on delivery) to ${LIMITS.terms} days.`;
  return errors;
}

export function validateContract(v: Partial<Record<keyof ContractInput, unknown>>) {
  const errors: Partial<Record<keyof ContractInput, string>> = validateTerms(v);
  if (typeof v.customerId !== "string" || !/^[a-f\d]{24}$/i.test(v.customerId))
    errors.customerId = "Choose the customer.";
  const start = v.startDate;
  const end = v.endDate;
  if (typeof start !== "string" || !isISODate(start)) errors.startDate = "Choose when it starts.";
  if (typeof end !== "string" || !isISODate(end)) errors.endDate = "Choose when it ends.";
  else if (typeof start === "string" && isISODate(start) && end < start) errors.endDate = "It ends before it starts.";
  const review = v.reviewOn;
  if (review !== null && (typeof review !== "string" || !isISODate(review)))
    errors.reviewOn = "Choose a review date, or leave it empty.";
  if (typeof v.notes !== "string" || v.notes.length > LIMITS.notes)
    errors.notes = `Keep it under ${LIMITS.notes} characters.`;
  const doc = v.document;
  if (doc !== null && (typeof doc !== "object" || !doc || typeof (doc as { url?: unknown }).url !== "string"))
    errors.document = "Attach the signed contract again.";
  return errors;
}

/** Where a contract stands today: an active one past its end date has expired. */
export function contractStatus(c: { status: StoredStatus; endDate: string }, today: string): ContractStatus {
  return c.status === "active" && c.endDate < today ? "expired" : c.status;
}

/** True when it runs on that day: active and within its dates. */
export const runsOn = (c: { status: StoredStatus; startDate: string; endDate: string }, day: string) =>
  c.status === "active" && c.startDate <= day && day <= c.endDate;

/** The day a contract of `months` starting on `start` ends: the day before the same date that many months on. */
export function endAfter(start: string, months: number) {
  const [y, m, d] = start.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const same = `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  return addDays(same, -1);
}

/** "₦3,200 a kg", from the price already formatted. */
export const priceLine = (formatted: string, pricing: Pricing) => `${formatted} ${PER_UNIT[pricing]}`;

/** Days before the end that the farm is warned a contract is ending. */
export const ENDING_WARNING_DAYS = 30;
