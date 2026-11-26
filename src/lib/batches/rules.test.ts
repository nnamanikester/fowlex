import { describe, expect, it } from "vitest";

import {
  ageOn,
  chickCostKobo,
  daysBetween,
  formatAge,
  paidCount,
  phaseOf,
  placedCount,
  targetDate,
  validateBatch,
} from "./rules";

const TODAY = "2026-11-26";
const good = {
  houseId: "h1",
  placedOn: "2026-11-02",
  breed: "Arbor Acres",
  delivered: 1020,
  deadOnArrival: 20,
  freeExtras: 20,
  pricePerChickKobo: 85_000,
  supplierName: "Amo Byng",
  ageAtPlacementDays: 0,
  targetSellAgeDays: 42,
  targetWeightGrams: 2200,
  notes: "",
};

describe("counts and money", () => {
  it("places the live chicks and charges only the paid ones", () => {
    expect(placedCount(good)).toBe(1000);
    expect(paidCount(good)).toBe(1000);
    expect(chickCostKobo(good)).toBe(85_000_000); // ₦850,000
  });
});

describe("age", () => {
  it("counts Day 0 as placement day, in weeks from week 1", () => {
    expect(ageOn(good, "2026-11-02")).toBe(0);
    expect(ageOn(good, TODAY)).toBe(24);
    expect(formatAge(0)).toBe("Day 0 · Week 1");
    expect(formatAge(6)).toBe("Day 6 · Week 1");
    expect(formatAge(7)).toBe("Day 7 · Week 2");
    expect(formatAge(24)).toBe("Day 24 · Week 4");
  });

  it("adds the age chicks arrived with, and is negative before placement", () => {
    expect(ageOn({ ...good, ageAtPlacementDays: 3 }, "2026-11-02")).toBe(3);
    expect(ageOn({ ...good, placedOn: "2026-11-29" }, TODAY)).toBe(-3);
  });

  it("works across months, years and leap days", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(targetDate(good)).toBe("2026-12-14");
    expect(targetDate({ ...good, ageAtPlacementDays: 2 })).toBe("2026-12-12");
  });
});

describe("phase", () => {
  it("is planned until the placement day, then follows the status", () => {
    expect(phaseOf({ status: "active", placedOn: "2026-11-27" }, TODAY)).toBe("planned");
    expect(phaseOf({ status: "active", placedOn: TODAY }, TODAY)).toBe("active");
    expect(phaseOf({ status: "selling", placedOn: "2026-10-01" }, TODAY)).toBe("selling");
    expect(phaseOf({ status: "closed", placedOn: "2026-12-01" }, TODAY)).toBe("closed");
  });
});

describe("validateBatch", () => {
  it("accepts a good batch", () => expect(validateBatch(good, TODAY)).toEqual({}));

  it.each([
    ["houseId", ""],
    ["placedOn", "2026-02-30"],
    ["placedOn", "26/11/2026"],
    ["placedOn", "2027-03-01"], // more than 90 days ahead
    ["placedOn", "2025-11-01"], // more than a year back
    ["breed", "  "],
    ["breed", "x".repeat(61)],
    ["delivered", 0],
    ["delivered", 10.5],
    ["delivered", 1_000_001],
    ["deadOnArrival", -1],
    ["deadOnArrival", 1020], // none alive
    ["freeExtras", 1020],
    ["pricePerChickKobo", -1],
    ["pricePerChickKobo", 10_000_001],
    ["supplierName", "x".repeat(81)],
    ["ageAtPlacementDays", 31],
    ["targetSellAgeDays", 20],
    ["targetSellAgeDays", 141],
    ["targetWeightGrams", 499],
    ["notes", "x".repeat(501)],
  ])("refuses %s = %j", (field, value) => {
    expect(validateBatch({ ...good, [field]: value }, TODAY)).toHaveProperty(field);
  });

  it("needs the sell age after the age at placement, and allows free chicks", () => {
    expect(validateBatch({ ...good, ageAtPlacementDays: 25, targetSellAgeDays: 25 }, TODAY)).toHaveProperty(
      "targetSellAgeDays",
    );
    expect(validateBatch({ ...good, pricePerChickKobo: 0 }, TODAY)).toEqual({});
  });
});
