// Safe for the browser: no model or database imports here.
import type { CategoryView } from "./categories";

export type BudgetState = "ok" | "warning" | "over";
/** Past this share of its budget a category is a warning; over 100% it's over. */
export const WARN_AT = 0.9;

/** How a category's spending stands against its budget. */
export function budgetState(spentKobo: number, budgetKobo: number): { percent: number; state: BudgetState } {
  const ratio = budgetKobo > 0 ? spentKobo / budgetKobo : spentKobo > 0 ? Infinity : 0;
  return {
    percent: Number.isFinite(ratio) ? Math.round(ratio * 100) : 100,
    state: ratio > 1 ? "over" : ratio >= WARN_AT ? "warning" : "ok",
  };
}

export type BudgetRow = {
  key: string;
  name: string;
  budgetKobo: number;
  spentKobo: number;
  leftKobo: number;
  percent: number;
  state: BudgetState;
};

/**
 * Each budgeted category's approved spending in a month (`YYYY-MM`) against its budget, most used
 * first. Waiting and rejected spending don't count.
 */
export function budgetRows(
  categories: CategoryView[],
  expenses: { category: string; date: string; amountKobo: number; approval: string }[],
  month: string,
): BudgetRow[] {
  const spent = new Map<string, number>();
  for (const e of expenses)
    if (e.approval === "approved" && e.date.slice(0, 7) === month)
      spent.set(e.category, (spent.get(e.category) ?? 0) + e.amountKobo);
  return categories
    .filter((c) => c.monthlyBudgetKobo !== null && !c.archived)
    .map((c) => {
      const spentKobo = spent.get(c.key) ?? 0;
      const budgetKobo = c.monthlyBudgetKobo!;
      return {
        key: c.key,
        name: c.name,
        budgetKobo,
        spentKobo,
        leftKobo: budgetKobo - spentKobo,
        ...budgetState(spentKobo, budgetKobo),
      };
    })
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
}
