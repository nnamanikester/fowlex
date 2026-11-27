// Safe for the browser: no model or database imports here.
import type { Category as ItemCategory } from "@/lib/inventory/rules";

/** What money was spent on. Phase 4 adds budgets and approvals to these. */
export const EXPENSE_CATEGORIES = [
  "feed",
  "chicks",
  "medication",
  "labour",
  "transport",
  "fuel",
  "utilities",
  "equipment",
  "repairs",
  "rent",
  "bank-charges",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  feed: "Feed",
  chicks: "Chicks",
  medication: "Drugs and vaccines",
  labour: "Labour",
  transport: "Transport",
  fuel: "Fuel",
  utilities: "Power and water",
  equipment: "Equipment",
  repairs: "Repairs",
  rent: "Rent",
  "bank-charges": "Bank charges",
  other: "Other",
};

/** The expense a stock purchase counts as, from the kind of item bought. */
export const CATEGORY_FOR_ITEM: Record<ItemCategory, ExpenseCategory> = {
  feed: "feed",
  medication: "medication",
  vaccine: "medication",
  chicks: "chicks",
  litter: "other",
  disinfectant: "medication",
  fuel: "fuel",
  packaging: "other",
  equipment: "equipment",
  other: "other",
};

/** How it was or will be paid. */
export const PAY_METHODS = ["paystack", "cash", "transfer", "pos", "later"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  paystack: "Paystack transfer",
  cash: "Cash",
  transfer: "Bank transfer (outside Fowlex)",
  pos: "POS",
  later: "Not paid yet",
};

/** Where the money is: owed, on its way (or waiting for an OTP), paid, or a transfer that failed. */
export const PAYMENT_STATUSES = ["unpaid", "paying", "otp", "paid", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Owed",
  paying: "Sending",
  otp: "Needs OTP",
  paid: "Paid",
  failed: "Transfer failed",
};

export type Line = { itemId: string; quantity: number; unitCostKobo: number };

export type ExpenseInput = {
  date: string;
  category: ExpenseCategory;
  /** What it was for; filled from the lines for a purchase. */
  description: string;
  supplierId: string | null;
  /** Who was paid when they aren't a saved supplier ("okada rider"). */
  payeeName: string;
  batchId: string | null;
  /** Stock bought. Empty for an expense that isn't stock. */
  lines: Line[];
  deliveryKobo: number;
  /** The total, for an expense without lines; worked out from the lines otherwise. */
  amountKobo: number;
  method: PayMethod;
  notes: string;
  receipt: { url: string; name: string } | null;
};

export const LIMITS = { text: 200, notes: 500, lines: 30, quantity: 10_000_000, kobo: 100_000_000_000 };

export const lineTotal = (l: Pick<Line, "quantity" | "unitCostKobo">) => Math.round(l.quantity * l.unitCostKobo);
/** A purchase's total: its lines and delivery; otherwise the amount entered. */
export const expenseTotal = (e: Pick<ExpenseInput, "lines" | "deliveryKobo" | "amountKobo">) =>
  e.lines.length ? e.lines.reduce((sum, l) => sum + lineTotal(l), 0) + e.deliveryKobo : e.amountKobo;

const money = (v: unknown, max = LIMITS.kobo) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;

export function validateExpense(v: Partial<Record<keyof ExpenseInput, unknown>>, { today }: { today: string }) {
  const errors: Partial<Record<keyof ExpenseInput | `lines.${number}`, string>> = {};
  if (typeof v.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) errors.date = "Choose the day.";
  else if (v.date > today) errors.date = "That's in the future.";
  if (!EXPENSE_CATEGORIES.includes(v.category as ExpenseCategory)) errors.category = "Choose what it was for.";
  if (typeof v.description !== "string" || v.description.length > LIMITS.text)
    errors.description = `Use at most ${LIMITS.text} characters.`;
  if (typeof v.payeeName !== "string" || v.payeeName.length > LIMITS.text) errors.payeeName = "Use fewer characters.";
  if (typeof v.notes !== "string" || v.notes.length > LIMITS.notes)
    errors.notes = `Keep it under ${LIMITS.notes} characters.`;
  if (!PAY_METHODS.includes(v.method as PayMethod)) errors.method = "Choose how it was paid.";

  const lines = v.lines;
  if (!Array.isArray(lines)) errors.lines = "Add what was bought.";
  else if (lines.length > LIMITS.lines) errors.lines = `Use at most ${LIMITS.lines} lines; split it in two.`;
  else
    lines.forEach((l: Partial<Line>, i) => {
      if (!l || typeof l.itemId !== "string" || !l.itemId) errors[`lines.${i}`] = "Choose the item.";
      else if (typeof l.quantity !== "number" || !(l.quantity > 0) || l.quantity > LIMITS.quantity)
        errors[`lines.${i}`] = "Enter how many.";
      else if (!money(l.unitCostKobo)) errors[`lines.${i}`] = "Enter the price for one.";
    });
  if (!money(v.deliveryKobo)) errors.deliveryKobo = "Enter the delivery cost, or 0.";
  if (Array.isArray(lines) && !lines.length) {
    if (!money(v.amountKobo) || v.amountKobo === 0) errors.amountKobo = "Enter how much was spent.";
    if (!errors.description && !(v.description as string).trim()) errors.description = "Say what it was for.";
  }
  if (v.method === "paystack" && !v.supplierId) errors.supplierId = "Choose a supplier with a bank account to pay.";
  return errors;
}

/** "20 bags Starter feed, 2 litres Disinfectant" from a purchase's lines. */
export function describeLines(lines: Line[], items: Map<string, { name: string; unit: string }>) {
  return lines
    .map((l) => {
      const item = items.get(l.itemId);
      return item
        ? `${l.quantity.toLocaleString("en-NG")} ${item.unit}${l.quantity === 1 ? "" : "s"} ${item.name}`
        : "";
    })
    .filter(Boolean)
    .join(", ")
    .slice(0, LIMITS.text);
}
