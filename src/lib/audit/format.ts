import { formatNaira } from "@/lib/money";

/** Field names as people say them: amountKobo → "Amount", passwordHash → "Password". */
const NAMES: Record<string, string> = { passwordHash: "Password", tokenHash: "Link" };

export function fieldName(field: string) {
  if (NAMES[field]) return NAMES[field];
  const words = field
    .replace(/Kobo$/, "")
    .replace(/Id$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** A logged value as text: money in naira, dates as dates, nothing as a dash. */
export function fieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "–";
  if (field.endsWith("Kobo") && typeof value === "number" && Number.isSafeInteger(value)) return formatNaira(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return DATE.format(new Date(value));
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** One change in a line: "Amount: ₦15,000.00 → ₦18,000.00". */
export function describeChange(change: { field: string; before: unknown; after: unknown }) {
  return `${fieldName(change.field)}: ${fieldValue(change.field, change.before)} → ${fieldValue(change.field, change.after)}`;
}
