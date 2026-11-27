// Safe for the browser: no model or database imports here.
import { normalisePhone } from "@/lib/suppliers/rules";

/** Who buys: the bulk buyers the farm sells to, and anyone else. */
export const CUSTOMER_TYPES = ["restaurant", "lounge", "hotel", "retailer", "individual", "other"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  restaurant: "Restaurant",
  lounge: "Lounge or bar",
  hotel: "Hotel",
  retailer: "Shop or market",
  individual: "Person",
  other: "Other",
};

export type CustomerInput = {
  name: string;
  type: CustomerType;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  /** The most they may owe at once, in kobo; null for no limit. */
  creditLimitKobo: number | null;
  /** Days they have to pay an invoice. */
  termsDays: number;
  notes: string;
};

export const LIMITS = { text: 120, address: 300, notes: 500, kobo: 100_000_000_000, terms: 365 };

export const tidyName = (name: string) => name.trim().replace(/\s+/g, " ");

export function validateCustomer(v: Partial<Record<keyof CustomerInput, unknown>>) {
  const errors: Partial<Record<keyof CustomerInput, string>> = {};
  const name = typeof v.name === "string" ? tidyName(v.name) : "";
  if (!name) errors.name = "Enter the customer's name.";
  else if (name.length > LIMITS.text) errors.name = `Use at most ${LIMITS.text} characters.`;
  if (!CUSTOMER_TYPES.includes(v.type as CustomerType)) errors.type = "Choose what kind of customer they are.";
  if (typeof v.contactName !== "string" || v.contactName.length > LIMITS.text)
    errors.contactName = `Use at most ${LIMITS.text} characters.`;
  if (typeof v.phone !== "string") errors.phone = "Enter a phone number.";
  else if (v.phone && !normalisePhone(v.phone)) errors.phone = "Enter a Nigerian number, like 0803 123 4567.";
  if (typeof v.email !== "string") errors.email = "Enter an email, or leave it empty.";
  else if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.email = "Enter a valid email.";
  if (typeof v.address !== "string" || v.address.length > LIMITS.address) errors.address = "Keep it shorter.";
  if (typeof v.notes !== "string" || v.notes.length > LIMITS.notes)
    errors.notes = `Keep it under ${LIMITS.notes} characters.`;
  const limit = v.creditLimitKobo;
  if (limit !== null && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0 || limit > LIMITS.kobo))
    errors.creditLimitKobo = "Enter the most they may owe, or leave it empty for no limit.";
  const terms = v.termsDays;
  if (typeof terms !== "number" || !Number.isInteger(terms) || terms < 0 || terms > LIMITS.terms)
    errors.termsDays = `Enter 0 (pay on delivery) to ${LIMITS.terms} days.`;
  return errors;
}

/** "Pays in 14 days", "Pays on delivery". */
export const termsLine = (days: number) =>
  days === 0 ? "Pays on delivery" : days === 1 ? "Pays in 1 day" : `Pays in ${days} days`;
