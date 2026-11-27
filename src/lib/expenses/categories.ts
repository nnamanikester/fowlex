// Safe for the browser: no model or database imports here.
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "./rules";

/**
 * A farm's expense category: the built-in ones (which can be renamed and budgeted) and its own.
 * Expenses keep the category's `key`, so renaming never touches past expenses.
 */
export type CategoryView = {
  key: string;
  name: string;
  /** Spend expected in a month, in kobo; null for none. */
  monthlyBudgetKobo: number | null;
  builtIn: boolean;
  archived: boolean;
};

/** Categories Fowlex fills itself (Paystack's fees): never chosen by hand, never archived. */
export const SYSTEM_CATEGORIES = ["bank-charges"];

export const DEFAULT_CATEGORIES: CategoryView[] = EXPENSE_CATEGORIES.map((key) => ({
  key,
  name: EXPENSE_CATEGORY_LABELS[key],
  monthlyBudgetKobo: null,
  builtIn: true,
  archived: false,
}));

export type CategoryInput = { name: string; monthlyBudgetKobo: number | null; archived?: boolean };

export const tidy = (name: string) => name.trim().replace(/\s+/g, " ");

export function validateCategory(v: Partial<Record<keyof CategoryInput, unknown>>) {
  const errors: Partial<Record<keyof CategoryInput, string>> = {};
  const name = typeof v.name === "string" ? tidy(v.name) : "";
  if (!name) errors.name = "Name the category.";
  else if (name.length > 40) errors.name = "Use at most 40 characters.";
  const budget = v.monthlyBudgetKobo;
  if (
    budget !== null &&
    budget !== undefined &&
    (typeof budget !== "number" || !Number.isInteger(budget) || budget < 0 || budget > 100_000_000_000)
  )
    errors.monthlyBudgetKobo = "Enter a monthly budget, or leave it empty.";
  return errors;
}

/** The name to show for a category key, from the farm's list (falling back to the built-in name). */
export function categoryName(categories: Pick<CategoryView, "key" | "name">[], key: string) {
  return (
    categories.find((c) => c.key === key)?.name ??
    EXPENSE_CATEGORY_LABELS[key as keyof typeof EXPENSE_CATEGORY_LABELS] ??
    "Other"
  );
}
