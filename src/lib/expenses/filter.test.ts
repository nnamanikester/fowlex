import { describe, expect, it } from "vitest";

import { CSV_HEADER, expenseMonths, expenseRows, filterExpenses } from "./filter";

const base = {
  supplierId: null as string | null,
  batchId: null as string | null,
  method: "cash" as const,
  paymentStatus: "paid" as "paid" | "unpaid" | "paying",
  paidOn: "2026-11-02",
  notes: "",
  receipt: null as { url: string } | null,
  payeeName: "",
};
const expenses = [
  {
    ...base,
    number: "EXP-2026-0001",
    date: "2026-11-02",
    category: "transport",
    description: "Feed from Ibadan",
    amountKobo: 1_500_000,
    payeeName: "Okada rider",
  },
  {
    ...base,
    number: "EXP-2026-0002",
    date: "2026-11-10",
    category: "c-guards",
    description: "Night guard",
    amountKobo: 3_000_000,
    paymentStatus: "unpaid" as const,
    paidOn: null,
    method: "later" as const,
  },
  {
    ...base,
    number: "EXP-2026-0003",
    date: "2026-10-30",
    category: "feed",
    description: "20 bags Starter feed",
    amountKobo: 36_000_000,
    supplierId: "s1",
    batchId: "b1",
    receipt: { url: "https://blob/r.jpg" },
    notes: "Delivered late",
  },
];
const lookups = {
  categories: [{ key: "c-guards", name: "Security" }],
  suppliers: new Map([["s1", "Amo Feeds"]]),
  batches: new Map([["b1", "B-2026-01"]]),
};
const none = { query: "", month: "", category: "", status: "all" as const };
const numbers = (list: { number: string }[]) => list.map((e) => e.number.slice(-1));

describe("finding expenses", () => {
  it("matches every word, in any order, across what, who, category, number and notes", () => {
    expect(numbers(filterExpenses(expenses, { ...none, query: "ibadan FEED" }, lookups))).toEqual(["1"]);
    expect(numbers(filterExpenses(expenses, { ...none, query: "amo" }, lookups))).toEqual(["3"]);
    expect(numbers(filterExpenses(expenses, { ...none, query: "security" }, lookups))).toEqual(["2"]);
    expect(numbers(filterExpenses(expenses, { ...none, query: "0002" }, lookups))).toEqual(["2"]);
    expect(numbers(filterExpenses(expenses, { ...none, query: "late" }, lookups))).toEqual(["3"]);
    expect(numbers(filterExpenses(expenses, { ...none, query: "okada" }, lookups))).toEqual(["1"]);
    expect(filterExpenses(expenses, { ...none, query: "  " }, lookups)).toHaveLength(3);
  });

  it("narrows by month, category and owed or paid", () => {
    expect(numbers(filterExpenses(expenses, { ...none, month: "2026-11" }, lookups))).toEqual(["1", "2"]);
    expect(numbers(filterExpenses(expenses, { ...none, category: "feed" }, lookups))).toEqual(["3"]);
    expect(numbers(filterExpenses(expenses, { ...none, status: "owed" }, lookups))).toEqual(["2"]);
    expect(numbers(filterExpenses(expenses, { ...none, status: "paid", month: "2026-11" }, lookups))).toEqual(["1"]);
    expect(expenseMonths(expenses)).toEqual(["2026-11", "2026-10"]);
  });

  it("writes one spreadsheet row per expense, amounts as numbers in naira", () => {
    const rows = expenseRows(expenses, lookups);
    expect(CSV_HEADER).toHaveLength(rows[0].length);
    expect(rows[0]).toEqual([
      "EXP-2026-0001",
      "2026-11-02",
      "Transport",
      "Feed from Ibadan",
      "Okada rider",
      15000,
      "Paid",
      "Cash",
      "2026-11-02",
      "",
      "",
      "",
    ]);
    expect(rows[1].slice(4, 9)).toEqual(["", 30000, "Owed", "", ""]);
    expect(rows[2].slice(4, 12)).toEqual([
      "Amo Feeds",
      360000,
      "Paid",
      "Cash",
      "2026-11-02",
      "B-2026-01",
      "Delivered late",
      "https://blob/r.jpg",
    ]);
    expect(expenseRows([{ ...expenses[2], supplierId: "gone", batchId: "gone" }], lookups)[0].slice(4, 10)).toEqual([
      "",
      360000,
      "Paid",
      "Cash",
      "2026-11-02",
      "",
    ]);
  });
});
