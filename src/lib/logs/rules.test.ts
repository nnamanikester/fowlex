import { describe, expect, it } from "vitest";

import { bags, suggestedFeed, validateLog } from "./rules";

const TODAY = "2026-11-26";
const good = {
  batchId: "b1",
  date: TODAY,
  deaths: 3,
  culls: 1,
  sold: 0,
  feedKg: 87.5,
  feedType: "Starter",
  waterLitres: 160,
  avgWeightGrams: 1200,
  notes: "",
};

describe("log rules", () => {
  it("suggests the feed for the age, and counts bags", () => {
    expect([0, 10, 11, 21, 22, 28, 29].map(suggestedFeed)).toEqual([
      "Pre-starter",
      "Pre-starter",
      "Starter",
      "Starter",
      "Grower",
      "Grower",
      "Finisher",
    ]);
    expect(bags(87.5)).toBe("3.5 bags");
    expect(bags(25)).toBe("1 bag");
  });

  it("accepts a good log, and one with nothing to report", () => {
    expect(validateLog(good, { today: TODAY, placedOn: "2026-11-02", aliveBefore: 1000 })).toEqual({});
    expect(
      validateLog(
        { ...good, deaths: 0, culls: 0, feedKg: 0, waterLitres: null, avgWeightGrams: null },
        { today: TODAY },
      ),
    ).toEqual({});
  });

  it.each([
    ["batchId", ""],
    ["date", "2026-11-27"],
    ["date", "2026-11-01"],
    ["date", "yesterday"],
    ["deaths", -1],
    ["culls", 1.5],
    ["sold", "4"],
    ["feedKg", -2],
    ["feedKg", 12.25],
    ["waterLitres", -1],
    ["avgWeightGrams", 10],
    ["avgWeightGrams", 9000],
    ["notes", "x".repeat(501)],
  ])("refuses %s = %j", (field, value) => {
    expect(validateLog({ ...good, [field]: value }, { today: TODAY, placedOn: "2026-11-02" })).toHaveProperty(field);
  });

  it("won't remove more birds than are left", () => {
    const errors = validateLog({ ...good, deaths: 5, culls: 3, sold: 2 }, { today: TODAY, aliveBefore: 9 });
    expect(errors.deaths).toBe("Only 9 birds were left; deaths, culls and sold add up to 10.");
    expect(validateLog({ ...good, deaths: 5, culls: 3, sold: 1 }, { today: TODAY, aliveBefore: 9 })).toEqual({});
  });
});
