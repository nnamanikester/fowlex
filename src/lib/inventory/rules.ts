// Safe for the browser: no model or database imports here (the model imports these, not the reverse).

/** What a stock item is. Equipment that lasts years is an asset (step 3.5), not stock. */
export const CATEGORIES = [
  "feed",
  "medication",
  "vaccine",
  "chicks",
  "litter",
  "disinfectant",
  "fuel",
  "packaging",
  "equipment",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  feed: "Feed",
  medication: "Drugs",
  vaccine: "Vaccines",
  chicks: "Chicks",
  litter: "Litter",
  disinfectant: "Disinfectant",
  fuel: "Fuel",
  packaging: "Packaging",
  equipment: "Small equipment",
  other: "Other",
};

/** How an item is counted. */
export const UNITS = ["bag", "kg", "litre", "vial", "bottle", "sachet", "carton", "piece", "bird"] as const;
export type Unit = (typeof UNITS)[number];

export type ItemInput = {
  name: string;
  category: Category;
  unit: Unit;
  /** Kilograms in one unit, for feed counted in bags: logs record feed in kg. */
  unitKg: number | null;
  /** Alert when stock falls below this many units; null for no alert. */
  reorderLevel: number | null;
  notes: string;
};

/** Items most Nigerian broiler farms keep, one tap to add. */
export const COMMON_ITEMS: ItemInput[] = [
  { name: "Starter feed", category: "feed", unit: "bag", unitKg: 25, reorderLevel: 10, notes: "" },
  { name: "Grower feed", category: "feed", unit: "bag", unitKg: 25, reorderLevel: 10, notes: "" },
  { name: "Finisher feed", category: "feed", unit: "bag", unitKg: 25, reorderLevel: 10, notes: "" },
  { name: "Wood shavings", category: "litter", unit: "bag", unitKg: null, reorderLevel: 5, notes: "" },
  { name: "Diesel", category: "fuel", unit: "litre", unitKg: null, reorderLevel: 50, notes: "" },
  { name: "Disinfectant", category: "disinfectant", unit: "litre", unitKg: null, reorderLevel: 2, notes: "" },
  { name: "Multivitamin", category: "medication", unit: "sachet", unitKg: null, reorderLevel: 5, notes: "" },
];

export const LIMITS = { name: 60, notes: 500, units: 10_000_000, unitKg: 1000 };

/** "  Starter   feed " → "Starter feed". */
export const tidyName = (name: string) => name.trim().replace(/\s+/g, " ");
/** The name as uniqueness sees it: "Starter Feed" and "starter  feed" are the same item. */
export const nameKey = (name: string) => tidyName(name).toLowerCase();

const plural: Partial<Record<Unit, string>> = { bird: "birds", kg: "kg" };
/** "1 bag", "3.5 bags", "20 kg", "1 litre". */
export function quantity(n: number, unit: Unit) {
  const value = Math.round(n * 100) / 100;
  const word = Math.abs(value) === 1 ? unit : (plural[unit] ?? `${unit}s`);
  return `${value.toLocaleString("en-NG")} ${word}`;
}

/** Field → message for anything wrong; empty when fine. */
export function validateItem(v: Partial<Record<keyof ItemInput, unknown>>) {
  const errors: Partial<Record<keyof ItemInput, string>> = {};
  const name = typeof v.name === "string" ? tidyName(v.name) : "";
  if (!name) errors.name = "Name the item, like Starter feed.";
  else if (name.length > LIMITS.name) errors.name = `Use at most ${LIMITS.name} characters.`;
  if (!CATEGORIES.includes(v.category as Category)) errors.category = "Choose what kind of item it is.";
  if (!UNITS.includes(v.unit as Unit)) errors.unit = "Choose how it's counted.";
  if (v.unitKg !== null && v.unitKg !== undefined) {
    if (typeof v.unitKg !== "number" || !(v.unitKg > 0) || v.unitKg > LIMITS.unitKg)
      errors.unitKg = "Enter the kg in one unit, like 25 for a 25 kg bag.";
  } else if (v.category === "feed" && v.unit !== "kg")
    errors.unitKg = "Enter the kg in one unit, so daily feed in kg can come off stock.";
  if (v.reorderLevel !== null && v.reorderLevel !== undefined) {
    if (typeof v.reorderLevel !== "number" || !(v.reorderLevel >= 0) || v.reorderLevel > LIMITS.units)
      errors.reorderLevel = "Enter how low stock can go before you reorder, or leave it empty.";
  }
  if (typeof v.notes !== "string") errors.notes = "Enter text.";
  else if (v.notes.length > LIMITS.notes) errors.notes = `Keep it under ${LIMITS.notes} characters.`;
  return errors;
}
