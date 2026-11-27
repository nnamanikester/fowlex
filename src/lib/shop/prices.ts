import { PRICINGS, type Pricing } from "@/lib/contracts/rules";
import { formatNaira } from "@/lib/money";

/**
 * The farm's prices: what it sells birds at, each named and either per bird or per kg ("Live
 * bird, ₦7,000 a bird"; "Big bird, ₦9,000 a bird"; "By weight, ₦3,200 a kg"). The first is the
 * usual one: new orders and "Sell now" start from it, and the order page shows every one.
 */
export type PriceOption = { id: string; name: string; pricing: Pricing; priceKobo: number };
export type PriceDraft = { id?: string; name: string; pricing: Pricing; priceKobo: number | null };

export const MAX_PRICES = 6;

/** Whole naira when there are no kobo: ₦7,000 reads faster than ₦7,000.00. */
export const naira = (kobo: number) => (kobo % 100 ? formatNaira(kobo) : formatNaira(kobo).replace(/\.00$/, ""));

/** "₦7,000 a bird" or "₦3,200 a kg". */
export const priceLabel = (p: Pick<PriceOption, "pricing" | "priceKobo">) =>
  `${naira(p.priceKobo)} a ${p.pricing === "perKg" ? "kg" : "bird"}`;

/** About what `birds` birds come to at a price, at about `weightGrams` each when it's per kg. */
export const priceEstimate = (p: Pick<PriceOption, "pricing" | "priceKobo">, birds: number, weightGrams: number) =>
  p.pricing === "perBird" ? birds * p.priceKobo : Math.round((birds * weightGrams * p.priceKobo) / 1000);

/** A name when none is given, from how it's priced. */
export const defaultName = (pricing: Pricing) => (pricing === "perKg" ? "By weight" : "Live bird");

/**
 * Checks a price list: one to six prices, each with an amount, per bird or per kg, and names that
 * tell them apart. Errors are keyed by row ("0.priceKobo") with "prices" for the list itself.
 */
export function validatePrices(list: unknown): Record<string, string> {
  if (!Array.isArray(list) || !list.length) return { prices: "Add at least one price." };
  if (list.length > MAX_PRICES) return { prices: `Keep it to ${MAX_PRICES} prices.` };
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  list.forEach((raw, i) => {
    const p = (raw ?? {}) as Partial<PriceDraft>;
    if (!PRICINGS.includes(p.pricing as Pricing)) errors[`${i}.pricing`] = "Choose per bird or per kg.";
    const price = p.priceKobo;
    if (typeof price !== "number" || !Number.isInteger(price) || price < 1 || price > 1_000_000_000)
      errors[`${i}.priceKobo`] = "Enter the price.";
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (name.length > 40) errors[`${i}.name`] = "Keep the name short.";
    const key = (name || defaultName(p.pricing as Pricing)).toLowerCase();
    if (seen.has(key)) errors[`${i}.name`] = "Give each price its own name.";
    seen.add(key);
  });
  return errors;
}
