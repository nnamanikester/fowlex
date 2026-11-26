import { describe, expect, it } from "vitest";

import { COMMON_ITEMS, nameKey, quantity, tidyName, validateItem } from "./rules";

const good = { name: "Starter feed", category: "feed", unit: "bag", unitKg: 25, reorderLevel: 10, notes: "" };

describe("inventory item rules", () => {
  it("accepts a 25 kg bag of starter feed, and every common item", () => {
    expect(validateItem(good)).toEqual({});
    for (const item of COMMON_ITEMS) expect(validateItem(item)).toEqual({});
    expect(validateItem({ ...good, unit: "kg", unitKg: null })).toEqual({});
    expect(validateItem({ ...good, category: "fuel", unit: "litre", unitKg: null, reorderLevel: null })).toEqual({});
  });

  it.each([
    ["name", ""],
    ["name", "x".repeat(61)],
    ["category", "gold"],
    ["unit", "tonne"],
    ["unitKg", 0],
    ["unitKg", 1001],
    ["unitKg", "25"],
    ["reorderLevel", -1],
    ["reorderLevel", "ten"],
    ["notes", "x".repeat(501)],
    ["notes", 4],
  ])("refuses %s = %j", (field, value) => {
    expect(validateItem({ ...good, [field]: value })).toHaveProperty(field);
  });

  it("needs the kg in a bag of feed, so daily logs can take it off stock", () => {
    expect(validateItem({ ...good, unitKg: null })).toHaveProperty("unitKg");
  });

  it("tidies names, matches them loosely and writes quantities", () => {
    expect(tidyName("  Starter   feed ")).toBe("Starter feed");
    expect(nameKey("Starter  FEED")).toBe("starter feed");
    expect(quantity(1, "bag")).toBe("1 bag");
    expect(quantity(3.456, "bag")).toBe("3.46 bags");
    expect(quantity(20, "kg")).toBe("20 kg");
    expect(quantity(2, "bird")).toBe("2 birds");
    expect(quantity(1200, "litre")).toBe("1,200 litres");
  });
});
