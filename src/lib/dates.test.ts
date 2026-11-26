import { describe, expect, it } from "vitest";

import { addDays, formatRange, isISODate, matchPreset, presetRange, today } from "./dates";

describe("today", () => {
  it("is the date in Lagos, whatever the device's time zone", () => {
    // 23:30 UTC on 30 Nov is already 00:30 on 1 Dec in Lagos (UTC+1).
    expect(today(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12-01");
    expect(today(new Date("2026-11-30T22:59:00Z"))).toBe("2026-11-30");
  });
});

describe("presetRange", () => {
  const on = "2026-11-26";
  it.each([
    ["today", "2026-11-26", "2026-11-26"],
    ["last-7", "2026-11-20", "2026-11-26"],
    ["last-30", "2026-10-28", "2026-11-26"],
    ["this-month", "2026-11-01", "2026-11-26"],
    ["last-month", "2026-10-01", "2026-10-31"],
    ["this-year", "2026-01-01", "2026-11-26"],
  ] as const)("%s", (id, from, to) => {
    expect(presetRange(id, on)).toEqual({ from, to });
  });

  it("handles year and leap-year edges", () => {
    expect(presetRange("last-month", "2027-01-15")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(presetRange("last-month", "2028-03-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("recognises a preset from its range", () => {
    expect(matchPreset({ from: "2026-11-01", to: "2026-11-26" }, on)).toBe("this-month");
    expect(matchPreset({ from: "2026-11-02", to: "2026-11-26" }, on)).toBeUndefined();
  });
});

describe("formatRange", () => {
  it("says a range as briefly as it can", () => {
    expect(formatRange({ from: "2026-11-03", to: "2026-11-03" })).toBe("3 Nov 2026");
    expect(formatRange({ from: "2026-11-03", to: "2026-11-24" })).toBe("3–24 Nov 2026");
    expect(formatRange({ from: "2026-10-28", to: "2026-11-03" })).toBe("28 Oct – 3 Nov 2026");
    expect(formatRange({ from: "2026-12-20", to: "2027-01-04" })).toBe("20 Dec 2026 – 4 Jan 2027");
  });
});

describe("isISODate", () => {
  it("accepts real calendar dates only", () => {
    expect(isISODate("2026-11-26")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("26/11/2026")).toBe(false);
  });
});
