import { describe, expect, it } from "vitest";

import { budgetRows, budgetState } from "./budget";
import { DEFAULT_CATEGORIES } from "./categories";

describe("budget against actual", () => {
  it("warns at 90% and past it (95% shows the warning), and is over above 100%", () => {
    expect(budgetState(9_500, 10_000)).toEqual({ percent: 95, state: "warning" });
    expect(budgetState(9_000, 10_000)).toEqual({ percent: 90, state: "warning" });
    expect(budgetState(8_999, 10_000)).toEqual({ percent: 90, state: "ok" });
    expect(budgetState(10_000, 10_000)).toEqual({ percent: 100, state: "warning" });
    expect(budgetState(10_001, 10_000)).toEqual({ percent: 100, state: "over" });
    expect(budgetState(0, 0)).toEqual({ percent: 0, state: "ok" });
    expect(budgetState(5, 0)).toEqual({ percent: 100, state: "over" });
  });

  it("counts a month's approved spending per budgeted category, most used first", () => {
    const categories = DEFAULT_CATEGORIES.map((c) =>
      c.key === "transport"
        ? { ...c, monthlyBudgetKobo: 10_000 }
        : c.key === "fuel"
          ? { ...c, monthlyBudgetKobo: 50_000 }
          : c.key === "rent"
            ? { ...c, monthlyBudgetKobo: 1, archived: true }
            : c,
    );
    const e = (category: string, amountKobo: number, date = "2026-11-10", approval = "approved") => ({
      category,
      amountKobo,
      date,
      approval,
    });
    const rows = budgetRows(
      categories,
      [
        e("transport", 6_000),
        e("transport", 3_500),
        e("transport", 9_000, "2026-10-30"),
        e("transport", 9_000, "2026-11-12", "pending"),
        e("fuel", 1_000),
        e("rent", 5),
      ],
      "2026-11",
    );
    expect(rows).toEqual([
      {
        key: "transport",
        name: "Transport",
        budgetKobo: 10_000,
        spentKobo: 9_500,
        leftKobo: 500,
        percent: 95,
        state: "warning",
      },
      { key: "fuel", name: "Fuel", budgetKobo: 50_000, spentKobo: 1_000, leftKobo: 49_000, percent: 2, state: "ok" },
    ]);
  });
});
