import { describe, expect, it } from "vitest";

import { isLow, ledger, type Movement } from "./stock";

let n = 0;
const m = (type: Movement["type"], date: string, quantity: number, unitCostKobo: number | null = null): Movement => ({
  id: String(++n),
  type,
  date,
  quantity,
  unitCostKobo,
  createdAt: `2026-11-26T00:00:${String(n % 60).padStart(2, "0")}Z`,
});

describe("stock at weighted average cost", () => {
  it("buys 20 bags at ₦18,000 and 10 at ₦19,500, uses 5, and values the 25 left at ₦18,500 each", () => {
    const { level, rows } = ledger([
      m("purchase", "2026-11-01", 20, 1_800_000),
      m("purchase", "2026-11-03", 10, 1_950_000),
      m("usage", "2026-11-05", -5),
    ]);
    expect(level).toEqual({ onHand: 25, valueKobo: 46_250_000, avgCostKobo: 1_850_000 });
    expect(rows.at(-1)).toMatchObject({ valueKobo: -9_250_000, balance: 25 });
  });

  it("orders by date, then by when recorded, whatever order they arrive in", () => {
    const { rows } = ledger([
      m("usage", "2026-11-05", -5),
      m("purchase", "2026-11-01", 10, 1_000_000),
      m("purchase", "2026-11-05", 10, 2_000_000),
    ]);
    expect(rows.map((r) => r.balance)).toEqual([10, 5, 15]);
  });

  it("costs a count that finds more at the average, and one that finds less as a loss", () => {
    const { level, rows } = ledger([
      m("opening", "2026-11-01", 10, 1_000_000),
      m("adjustment", "2026-11-02", 2),
      m("adjustment", "2026-11-03", -4),
    ]);
    expect(rows.map((r) => r.valueKobo)).toEqual([10_000_000, 2_000_000, -4_000_000]);
    expect(level).toEqual({ onHand: 8, valueKobo: 8_000_000, avgCostKobo: 1_000_000 });
  });

  it("lets stock go below zero, costed at the last average, and recovers when bought", () => {
    const { level, rows } = ledger([
      m("purchase", "2026-11-01", 2, 1_000_000),
      m("usage", "2026-11-02", -3),
      m("purchase", "2026-11-03", 5, 1_200_000),
    ]);
    expect(rows[1]).toMatchObject({ balance: -1, valueKobo: -3_000_000, balanceValueKobo: 0 });
    expect(level).toMatchObject({ onHand: 4 });
    // Usage with nothing ever bought is costed at nothing.
    expect(ledger([m("usage", "2026-11-01", -2)]).level).toEqual({ onHand: -2, valueKobo: 0, avgCostKobo: null });
  });

  it("starts the average again once stock runs out, and handles fractions of a bag", () => {
    const { level } = ledger([
      m("purchase", "2026-11-01", 4, 1_000_000),
      m("usage", "2026-11-02", -4),
      m("purchase", "2026-11-03", 2, 2_000_000),
      m("usage", "2026-11-04", -0.5),
    ]);
    expect(level).toEqual({ onHand: 1.5, valueKobo: 3_000_000, avgCostKobo: 2_000_000 });
    expect(ledger([]).level).toEqual({ onHand: 0, valueKobo: 0, avgCostKobo: null });
  });

  it("flags stock at or under its reorder level", () => {
    expect(isLow(10, 10)).toBe(true);
    expect(isLow(11, 10)).toBe(false);
    expect(isLow(0, null)).toBe(false);
  });
});
