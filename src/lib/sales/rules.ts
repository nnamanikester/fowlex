// Safe for the browser: no model or database imports here.
import { isISODate } from "@/lib/dates";
import { PRICINGS, type Pricing } from "@/lib/contracts/rules";

/** Booked, then delivered (the birds leave the batch), then on an invoice; or called off. */
export const ORDER_STATUSES = ["pending", "delivered", "invoiced", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "To deliver",
  delivered: "Delivered",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};
export const ORDER_TONE = { pending: "warning", delivered: "info", invoiced: "success", cancelled: "neutral" } as const;

/** Birds from one batch: how many, their total live weight (once weighed), and the price. */
export type OrderLine = {
  batchId: string;
  birds: number;
  /** Their weight: as weighed, or (not `weighed`) the batch's estimate for a per-kg line. */
  weightGrams: number;
  priceKobo: number;
  pricing: Pricing;
  /** False when the weight is the batch's estimate, not a weighing: it can be weighed later. */
  weighed?: boolean;
};

export type OrderInput = {
  customerId: string;
  deliveryDate: string;
  lines: OrderLine[];
  /** What the customer pays for delivery, in kobo. */
  deliveryKobo: number;
  notes: string;
};

export const LIMITS = { birds: 1_000_000, grams: 1_000_000_000, kobo: 10_000_000_00, lines: 20, notes: 500 };

/** A line's amount: birds × price, or kg × price (to the kobo, from grams). */
export const lineAmount = (l: Pick<OrderLine, "birds" | "weightGrams" | "priceKobo" | "pricing">) =>
  l.pricing === "perBird" ? l.birds * l.priceKobo : Math.round((l.weightGrams * l.priceKobo) / 1000);

export const orderTotal = (o: { lines: OrderLine[]; deliveryKobo: number }) =>
  o.lines.reduce((sum, l) => sum + lineAmount(l), 0) + o.deliveryKobo;

/** "1.5 kg" from grams, to one decimal place. */
export const kg = (grams: number) => `${(Math.round(grams / 100) / 10).toLocaleString("en-NG")} kg`;

/**
 * Checks an order. Weighing is never required: a per-kg line left at zero is priced on its
 * batch's estimated weight.
 */
export function validateOrder(v: Partial<Record<keyof OrderInput, unknown>>) {
  const errors: Partial<Record<keyof OrderInput | `lines.${number}.${keyof OrderLine}`, string>> = {};
  if (typeof v.customerId !== "string" || !/^[a-f\d]{24}$/i.test(v.customerId))
    errors.customerId = "Choose the customer.";
  if (typeof v.deliveryDate !== "string" || !isISODate(v.deliveryDate))
    errors.deliveryDate = "Choose the delivery day.";
  const d = v.deliveryKobo;
  if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > LIMITS.kobo)
    errors.deliveryKobo = "Enter the delivery charge, or 0.";
  if (typeof v.notes !== "string" || v.notes.length > LIMITS.notes)
    errors.notes = `Keep it under ${LIMITS.notes} characters.`;
  if (!Array.isArray(v.lines) || v.lines.length === 0) errors.lines = "Add the birds: which batch and how many.";
  else if (v.lines.length > LIMITS.lines) errors.lines = `At most ${LIMITS.lines} lines.`;
  else
    (v.lines as Partial<Record<keyof OrderLine, unknown>>[]).forEach((l, i) => {
      if (typeof l?.batchId !== "string" || !/^[a-f\d]{24}$/i.test(l.batchId))
        errors[`lines.${i}.batchId`] = "Choose the batch.";
      const birds = l?.birds;
      if (typeof birds !== "number" || !Number.isInteger(birds) || birds < 1 || birds > LIMITS.birds)
        errors[`lines.${i}.birds`] = "Enter how many birds.";
      const g = l?.weightGrams;
      if (typeof g !== "number" || !Number.isInteger(g) || g < 0 || g > LIMITS.grams)
        errors[`lines.${i}.weightGrams`] = "Enter their total weight in kg, or leave it empty.";
      if (!PRICINGS.includes(l?.pricing as Pricing)) errors[`lines.${i}.pricing`] = "Choose per kg or per bird.";
      const p = l?.priceKobo;
      if (typeof p !== "number" || !Number.isInteger(p) || p < 1 || p > LIMITS.kobo)
        errors[`lines.${i}.priceKobo`] = "Enter the price.";
    });
  return errors;
}
