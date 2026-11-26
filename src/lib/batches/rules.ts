/**
 * Batch rules shared by the form and the server. Browser-safe: no models or database here.
 * Dates are Lagos calendar days ("YYYY-MM-DD"); money is kobo; weights are grams.
 */
import { addDays, isISODate } from "@/lib/dates";

export const BATCH_TYPES = ["broiler"] as const;
export const BATCH_STATUSES = ["active", "selling", "closed"] as const;

/** Breeds common on Nigerian farms, offered as suggestions; any name is allowed. */
export const BREEDS = ["Arbor Acres", "Cobb 500", "Ross 308", "Hubbard", "Marshall"];

export const LIMITS = {
  chicks: 1_000_000,
  pricePerChickKobo: 10_000_000, // ₦100,000: beyond any real chick price.
  sellAgeDays: [21, 140],
  weightGrams: [500, 6000],
  ageAtPlacementDays: 30,
  daysAhead: 90,
  daysBack: 365,
} as const;

export const DEFAULTS = { targetSellAgeDays: 42, targetWeightGrams: 2200 };

export type BatchInput = {
  houseId: string;
  placedOn: string;
  breed: string;
  delivered: number;
  deadOnArrival: number;
  freeExtras: number;
  pricePerChickKobo: number;
  supplierName: string;
  ageAtPlacementDays: number;
  targetSellAgeDays: number;
  targetWeightGrams: number;
  notes: string;
};

/** Live chicks that went into the house: delivered, less those dead on arrival. */
export const placedCount = (b: Pick<BatchInput, "delivered" | "deadOnArrival">) => b.delivered - b.deadOnArrival;
/** Chicks paid for: the hatchery's free extras cost nothing. */
export const paidCount = (b: Pick<BatchInput, "delivered" | "freeExtras">) => b.delivered - b.freeExtras;
/** What the chicks cost, in kobo. */
export const chickCostKobo = (b: Pick<BatchInput, "delivered" | "freeExtras" | "pricePerChickKobo">) =>
  paidCount(b) * b.pricePerChickKobo;

const toUTC = (d: string) => Date.parse(`${d}T00:00:00Z`);
/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string) => Math.round((toUTC(to) - toUTC(from)) / 86_400_000);

/** The birds' age in days on `on`: Day 0 is placement day (plus any age they arrived with). Negative before placement. */
export const ageOn = (b: Pick<BatchInput, "placedOn" | "ageAtPlacementDays">, on: string) =>
  daysBetween(b.placedOn, on) + b.ageAtPlacementDays;

/** "Day 24 · Week 4": week 1 is days 0–6. */
export function formatAge(days: number) {
  return `Day ${days} · Week ${Math.floor(days / 7) + 1}`;
}

export type Phase = "planned" | "active" | "selling" | "closed";

/** Where a batch is: planned until its placement day, then as its status says. */
export function phaseOf(b: { status: (typeof BATCH_STATUSES)[number]; placedOn: string }, today: string): Phase {
  if (b.status === "closed") return "closed";
  if (b.placedOn > today) return "planned";
  return b.status;
}

export const PHASE_LABELS: Record<Phase, string> = {
  planned: "Planned",
  active: "Growing",
  selling: "Selling",
  closed: "Closed",
};

/** The day the batch reaches its target sell age. */
export const targetDate = (b: Pick<BatchInput, "placedOn" | "ageAtPlacementDays" | "targetSellAgeDays">) =>
  addDays(b.placedOn, b.targetSellAgeDays - b.ageAtPlacementDays);

const int = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

/** Field → message for anything wrong; empty when fine. `today` is Lagos today. */
export function validateBatch(input: Partial<Record<keyof BatchInput, unknown>>, today: string) {
  const errors: Partial<Record<keyof BatchInput, string>> = {};
  if (typeof input.houseId !== "string" || !input.houseId) errors.houseId = "Choose the house the chicks go into.";

  const placedOn = input.placedOn;
  if (typeof placedOn !== "string" || !isISODate(placedOn)) errors.placedOn = "Choose the day the chicks were placed.";
  else if (placedOn > addDays(today, LIMITS.daysAhead))
    errors.placedOn = `Use a date within ${LIMITS.daysAhead} days from today.`;
  else if (placedOn < addDays(today, -LIMITS.daysBack)) errors.placedOn = "Use a date within the last year.";

  const breed = typeof input.breed === "string" ? input.breed.trim() : "";
  if (!breed) errors.breed = "Enter the breed, like Arbor Acres.";
  else if (breed.length > 60) errors.breed = "Use at most 60 characters.";

  const { delivered, deadOnArrival, freeExtras } = input;
  if (!int(delivered) || delivered < 1) errors.delivered = "Enter how many chicks arrived, as a whole number.";
  else if (delivered > LIMITS.chicks) errors.delivered = `Use at most ${LIMITS.chicks.toLocaleString("en-NG")}.`;
  const deliveredOk = int(delivered) && delivered >= 1;
  if (!int(deadOnArrival) || deadOnArrival < 0) errors.deadOnArrival = "Enter 0 or more.";
  else if (deliveredOk && deadOnArrival >= delivered)
    errors.deadOnArrival = "At least one chick must be alive to place.";
  if (!int(freeExtras) || freeExtras < 0) errors.freeExtras = "Enter 0 or more.";
  else if (deliveredOk && freeExtras >= delivered)
    errors.freeExtras = "Free extras must be fewer than the chicks delivered.";

  const price = input.pricePerChickKobo;
  if (!int(price) || price < 0) errors.pricePerChickKobo = "Enter the price per chick (0 if they were free).";
  else if (price > LIMITS.pricePerChickKobo)
    errors.pricePerChickKobo = "That's more than any chick costs. Check the amount.";

  if (typeof input.supplierName !== "string") errors.supplierName = "Enter text.";
  else if (input.supplierName.length > 80) errors.supplierName = "Use at most 80 characters.";

  const age = input.ageAtPlacementDays;
  if (!int(age) || age < 0 || age > LIMITS.ageAtPlacementDays)
    errors.ageAtPlacementDays = `Use 0 (day-old chicks) to ${LIMITS.ageAtPlacementDays} days.`;

  const sell = input.targetSellAgeDays;
  const [minSell, maxSell] = LIMITS.sellAgeDays;
  if (!int(sell) || sell < minSell || sell > maxSell) errors.targetSellAgeDays = `Use ${minSell} to ${maxSell} days.`;
  else if (int(age) && sell <= age) errors.targetSellAgeDays = "The sell age must be after the age at placement.";

  const weight = input.targetWeightGrams;
  const [minW, maxW] = LIMITS.weightGrams;
  if (!int(weight) || weight < minW || weight > maxW)
    errors.targetWeightGrams = `Use ${minW / 1000} to ${maxW / 1000} kg.`;

  if (typeof input.notes !== "string") errors.notes = "Enter text.";
  else if (input.notes.length > 500) errors.notes = "Use at most 500 characters.";
  return errors;
}
