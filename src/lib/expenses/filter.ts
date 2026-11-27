// Safe for the browser: no model or database imports here.
import { type CategoryView, categoryName } from "./categories";
import { PAY_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "./rules";
import type { CsvValue } from "@/lib/csv";

type Expense = {
  number: string;
  date: string;
  category: string;
  description: string;
  payeeName: string;
  supplierId: string | null;
  batchId: string | null;
  amountKobo: number;
  method: keyof typeof PAY_METHOD_LABELS;
  paymentStatus: keyof typeof PAYMENT_STATUS_LABELS;
  paidOn: string | null;
  notes: string;
  receipt: { url: string } | null;
};

export type ExpenseFilter = {
  query: string;
  /** "YYYY-MM", or "" for every month. */
  month: string;
  /** A category key, or "" for all. */
  category: string;
  status: "all" | "owed" | "paid";
};

/**
 * The expenses matching a filter: words found in the number, description, category, payee or
 * notes (any order, any case); a month; a category; owed (including transfers on their way) or paid.
 */
export function filterExpenses<E extends Expense>(
  expenses: E[],
  f: ExpenseFilter,
  { categories, suppliers }: { categories: Pick<CategoryView, "key" | "name">[]; suppliers: Map<string, string> },
) {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  return expenses.filter((e) => {
    if (f.month && e.date.slice(0, 7) !== f.month) return false;
    if (f.category && e.category !== f.category) return false;
    if (f.status === "paid" && e.paymentStatus !== "paid") return false;
    if (f.status === "owed" && e.paymentStatus === "paid") return false;
    if (!words.length) return true;
    const text = [
      e.number,
      e.description,
      categoryName(categories, e.category),
      e.supplierId ? suppliers.get(e.supplierId) : e.payeeName,
      e.notes,
    ]
      .join(" ")
      .toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** Months with expenses, newest first ("2026-11"). */
export const expenseMonths = (expenses: Pick<Expense, "date">[]) =>
  [...new Set(expenses.map((e) => e.date.slice(0, 7)))].sort().reverse();

export const CSV_HEADER = [
  "Number",
  "Date",
  "Category",
  "Description",
  "Paid to",
  "Amount (NGN)",
  "Status",
  "Paid by",
  "Paid on",
  "Batch",
  "Notes",
  "Receipt",
];

/** One row per expense for the spreadsheet, amounts in naira with kobo. */
export function expenseRows<E extends Expense>(
  expenses: E[],
  {
    categories,
    suppliers,
    batches,
  }: { categories: Pick<CategoryView, "key" | "name">[]; suppliers: Map<string, string>; batches: Map<string, string> },
): CsvValue[][] {
  return expenses.map((e) => [
    e.number,
    e.date,
    categoryName(categories, e.category),
    e.description,
    (e.supplierId ? suppliers.get(e.supplierId) : e.payeeName) ?? "",
    e.amountKobo / 100,
    PAYMENT_STATUS_LABELS[e.paymentStatus],
    e.paymentStatus === "paid" ? PAY_METHOD_LABELS[e.method] : "",
    e.paidOn ?? "",
    e.batchId ? (batches.get(e.batchId) ?? "") : "",
    e.notes,
    e.receipt?.url ?? "",
  ]);
}
