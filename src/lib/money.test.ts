import { describe, expect, it } from "vitest";

import { formatNaira, formatNairaPlain, isTypingNaira, nairaToKobo } from "./money";

describe("formatNaira", () => {
  it("shows kobo as naira with the sign, commas and two decimals", () => {
    expect(formatNaira(123456)).toBe("₦1,234.56");
    expect(formatNaira(0)).toBe("₦0.00");
    expect(formatNaira(5)).toBe("₦0.05");
    expect(formatNaira(100_000_000)).toBe("₦1,000,000.00");
    expect(formatNaira(-5000)).toBe("-₦50.00");
  });

  it("shortens large amounts for axes", () => {
    expect(formatNaira(125_000_000, { compact: true })).toBe("₦1.3M");
    expect(formatNaira(4_500_000, { compact: true })).toBe("₦45K");
  });

  it("refuses anything that isn't whole kobo", () => {
    expect(() => formatNaira(12.5)).toThrow(RangeError);
    expect(() => formatNaira(Number.NaN)).toThrow(RangeError);
  });

  it("formats without the sign for inputs", () => {
    expect(formatNairaPlain(123456)).toBe("1,234.56");
  });
});

describe("nairaToKobo", () => {
  it.each([
    ["1234.56", 123456],
    ["1,234.56", 123456],
    ["₦ 1,234.56", 123456],
    ["0.1", 10],
    ["0.05", 5],
    ["12.", 1200],
    [".5", 50],
    ["18000", 1_800_000],
    ["0", 0],
  ])("%s → %i kobo", (input, kobo) => {
    expect(nairaToKobo(input)).toBe(kobo);
  });

  it.each(["", "abc", "1.234", "-5", "1.2.3", "1e5", ",", "."])("%j is not an amount", (input) => {
    expect(nairaToKobo(input)).toBeNull();
  });

  it("never yields a fraction of a kobo", () => {
    // Every amount with up to two decimals, plus a spread of awkward inputs.
    for (let cents = 0; cents < 5000; cents++) {
      const input = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
      const kobo = nairaToKobo(input);
      expect(kobo).toBe(cents);
    }
    for (const input of ["0.1", "0.29", "1.005", "19.99", "1,000.07", "99999999.99"]) {
      const kobo = nairaToKobo(input);
      if (kobo !== null) expect(Number.isInteger(kobo)).toBe(true);
    }
  });

  it("round-trips with formatNairaPlain", () => {
    for (const kobo of [0, 1, 99, 100, 123456, 987654321]) expect(nairaToKobo(formatNairaPlain(kobo))).toBe(kobo);
  });
});

describe("isTypingNaira", () => {
  it("allows half-typed amounts and blocks a third decimal", () => {
    for (const ok of ["", "1", "1,2", "12.", "12.3", "12.34", ".5"]) expect(isTypingNaira(ok)).toBe(true);
    for (const bad of ["12.345", "a", "-", "1..2"]) expect(isTypingNaira(bad)).toBe(false);
  });
});
