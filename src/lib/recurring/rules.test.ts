import { describe, expect, it } from "vitest";

import { dueDates, nextMonthly, ordinal, periodOf } from "./rules";

describe("monthly dates", () => {
  it("moves to the same day next month, across the year", () => {
    expect(nextMonthly("2026-12-01", 1)).toBe("2027-01-01");
    expect(nextMonthly("2026-11-15", 15)).toBe("2026-12-15");
  });

  it("puts the 31st on the last day of a short month, then back on the 31st", () => {
    expect(nextMonthly("2027-01-31", 31)).toBe("2027-02-28");
    expect(nextMonthly("2027-02-28", 31)).toBe("2027-03-31");
    expect(nextMonthly("2028-01-31", 31)).toBe("2028-02-29");
    expect(nextMonthly("2027-03-31", 31)).toBe("2027-04-30");
  });

  it("lists every due date up to today, to catch up after missed runs", () => {
    expect(dueDates("2027-01-01", 1, "2026-12-31")).toEqual([]);
    expect(dueDates("2027-01-01", 1, "2027-01-01")).toEqual(["2027-01-01"]);
    expect(dueDates("2027-01-01", 1, "2027-03-15")).toEqual(["2027-01-01", "2027-02-01", "2027-03-01"]);
    expect(dueDates("2020-01-01", 1, "2027-01-01", 3)).toHaveLength(3);
    expect(periodOf("2027-01-01")).toBe("2027-01");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 31].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "31st",
    ]);
  });
});
