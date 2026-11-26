import { describe, expect, it } from "vitest";

import { nameKey, suggestedCapacity, tidyName, validateHouse } from "./rules";

const good = {
  name: "House 1",
  capacity: 1200,
  floorAreaSqm: 120,
  system: "deep-litter",
  ventilation: "open-sided",
  status: "active",
  notes: "",
};

describe("house rules", () => {
  it("tidies names and compares them ignoring case and spacing", () => {
    expect(tidyName("  House   1 ")).toBe("House 1");
    expect(nameKey("  HOUSE   1")).toBe(nameKey("house 1"));
  });

  it("suggests capacity from floor area and density, rounded down", () => {
    expect(suggestedCapacity(120, 10)).toBe(1200);
    expect(suggestedCapacity(95.5, 12)).toBe(1146);
    expect(suggestedCapacity(null, 10)).toBeNull();
    expect(suggestedCapacity(0, 10)).toBeNull();
  });

  it("accepts a good house, with or without floor area", () => {
    expect(validateHouse(good)).toEqual({});
    expect(validateHouse({ ...good, floorAreaSqm: null })).toEqual({});
  });

  it.each([
    ["name", "   "],
    ["name", "x".repeat(41)],
    ["capacity", 0],
    ["capacity", 12.5],
    ["capacity", 1_000_001],
    ["capacity", "1000"],
    ["floorAreaSqm", -5],
    ["floorAreaSqm", 0],
    ["system", "battery"],
    ["ventilation", "windy"],
    ["status", "empty"],
    ["notes", "x".repeat(501)],
    ["notes", 5],
  ])("refuses %s = %j", (field, value) => {
    expect(validateHouse({ ...good, [field]: value })).toHaveProperty(field);
  });
});
