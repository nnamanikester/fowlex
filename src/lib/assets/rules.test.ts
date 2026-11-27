import { describe, expect, it } from "vitest";

import { bookValue, depreciationFor, monthlyDepreciation, validateAsset } from "./rules";

const generator = { costKobo: 60_000_000, salvageKobo: 0, purchasedOn: "2026-01-10", usefulLifeMonths: 24 };

describe("straight-line depreciation", () => {
  it("costs ₦25,000 a month for a ₦600,000 generator over 24 months", () => {
    expect(depreciationFor(generator, "2026-01")).toBe(2_500_000);
    expect(depreciationFor(generator, "2027-12")).toBe(2_500_000);
    expect(depreciationFor(generator, "2025-12")).toBe(0);
    expect(depreciationFor(generator, "2028-01")).toBe(0);
  });

  it("adds up to cost less salvage exactly, settling the rounding in the last month", () => {
    const odd = { costKobo: 1_000_000, salvageKobo: 100, purchasedOn: "2026-03-31", usefulLifeMonths: 7 };
    const months = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
    const each = months.map((m) => depreciationFor(odd, m));
    expect(each.slice(0, 6)).toEqual(Array(6).fill(142_842));
    expect(each.reduce((a, b) => a + b)).toBe(999_900);
    expect(bookValue(odd, "2030-01-01")).toBe(100);
  });

  it("stops after the month it was sold or scrapped, and values what's left", () => {
    const sold = { ...generator, disposedOn: "2026-06-15" };
    expect(depreciationFor(sold, "2026-06")).toBe(2_500_000);
    expect(depreciationFor(sold, "2026-07")).toBe(0);
    expect(bookValue(generator, "2026-01-31")).toBe(57_500_000);
    expect(bookValue(generator, "2026-12-01")).toBe(30_000_000);
    expect(bookValue(generator, "2025-12-31")).toBe(60_000_000);
    expect(monthlyDepreciation([generator, generator, sold], "2026-07")).toBe(5_000_000);
  });
});

describe("validateAsset", () => {
  const good = {
    name: "Perkins generator",
    kind: "generator",
    costKobo: 60_000_000,
    salvageKobo: 0,
    purchasedOn: "2026-01-10",
    usefulLifeMonths: 24,
    notes: "",
  };
  const ctx = { today: "2026-11-27" };
  it("accepts a generator", () => expect(validateAsset(good, ctx)).toEqual({}));
  it.each([
    ["name", ""],
    ["name", "x".repeat(81)],
    ["kind", "rocket"],
    ["costKobo", 0],
    ["costKobo", 1.5],
    ["salvageKobo", -1],
    ["salvageKobo", 60_000_000],
    ["purchasedOn", "2026-11-28"],
    ["purchasedOn", "soon"],
    ["usefulLifeMonths", 0],
    ["usefulLifeMonths", 601],
    ["usefulLifeMonths", 1.5],
    ["notes", "x".repeat(501)],
  ])("refuses %s = %j", (field, value) => {
    expect(validateAsset({ ...good, [field]: value }, ctx)).toHaveProperty(field);
  });
});
