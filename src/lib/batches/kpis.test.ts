import { describe, expect, it } from "vitest";

import { batchKpis, growthRows, standardWeight, vsStandard } from "./kpis";

const batch = { placed: 1000, placedOn: "2026-10-01", ageAtPlacementDays: 0 };
const log = (date: string, over: Partial<Parameters<typeof batchKpis>[1][number]> = {}) => ({
  date,
  deaths: 0,
  culls: 0,
  sold: 0,
  feedKg: 0,
  avgWeightGrams: null,
  ...over,
});

/** A log for every day from day 1 to `days`, with `feedKg` each (the last day gets `lastFeed`). */
const daily = (days: number, feedKg: number, lastFeed = feedKg) =>
  Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.UTC(2026, 9, 2 + i)).toISOString().slice(0, 10);
    return log(date, { feedKg: i === days - 1 ? lastFeed : feedKg });
  });

describe("batch KPIs", () => {
  it("works the textbook example: 1,000 placed, 40 lost, 2.5 kg at day 35 on 3,840 kg of feed", () => {
    // 960 birds × 2.5 kg = 2,400 kg live weight; 3,840 / 2,400 = FCR 1.6.
    // EPEF = 96 × 2.5 ÷ (35 × 1.6) × 100 = 428.6; ADG = (2,500 − 42) ÷ 35 = 70.2 g.
    const logs = daily(35, 110, 100);
    logs[8] = { ...logs[8], deaths: 30, culls: 10 };
    logs[34] = { ...logs[34], avgWeightGrams: 2500 };
    expect(batchKpis(batch, logs)).toEqual({
      livability: 96,
      mortality: 4,
      feedKg: 3840,
      feedPerBirdKg: 4,
      weighed: { date: "2026-11-05", age: 35, grams: 2500 },
      feedGaps: 0,
      fcr: 1.6,
      adg: 70.2,
      epef: 429,
    });
  });

  it("counts sold birds as survivors, and measures FCR at the weighing with the feed eaten by then", () => {
    const logs = [...daily(28, 70, 40), log("2026-11-01", { sold: 500, feedKg: 300 })];
    logs[27] = { ...logs[27], deaths: 20, avgWeightGrams: 1859 }; // day 28: 1,930 kg eaten
    const k = batchKpis(batch, logs);
    expect(k.livability).toBe(98);
    expect(k.feedPerBirdKg).toBe(2.28); // 2,230 kg ÷ 980
    expect(k.fcr).toBe(1.06); // 1,930 kg ÷ (980 × 1.859 kg)
  });

  it("waits for most days' feed before FCR and EPEF, saying how many are missing", () => {
    const logs = daily(28, 70).filter((_, i) => i % 3 !== 0); // a third of the days missing
    logs.push(log("2026-10-29", { feedKg: 70, avgWeightGrams: 1800 }));
    const k = batchKpis(batch, logs);
    expect(k).toMatchObject({ fcr: null, epef: null, adg: 62.8 });
    expect(k.feedGaps).toBe(10); // 29 days (0 to 28), 19 with feed
  });

  it("has no weight numbers before a weighing, and nothing at all without birds", () => {
    expect(batchKpis(batch, [log("2026-10-05", { deaths: 5, feedKg: 50 })])).toMatchObject({
      livability: 99.5,
      mortality: 0.5,
      weighed: null,
      fcr: null,
      adg: null,
      epef: null,
    });
    expect(batchKpis({ ...batch, placed: 0 }, [])).toMatchObject({
      livability: null,
      mortality: null,
      feedPerBirdKg: null,
    });
    // Weighed on placement day: no age to divide by, and no FCR without feed.
    expect(batchKpis(batch, [log("2026-10-01", { avgWeightGrams: 44 })])).toMatchObject({
      adg: null,
      fcr: null,
      epef: null,
    });
  });

  it("follows the Ross 308 standard, in between its points too", () => {
    expect(standardWeight(0)).toBe(44);
    expect(standardWeight(35)).toBe(2609);
    expect(standardWeight(10)).toBe(374); // 214 + (588 − 214) × 3/7
    expect(standardWeight(-1)).toBeNull();
    expect(standardWeight(50)).toBeNull();
    expect(vsStandard({ date: "2026-11-05", age: 35, grams: 2500 })).toBe(-4.2);
    expect(vsStandard(null)).toBeNull();
    expect(vsStandard({ date: "2026-11-25", age: 55, grams: 4000 })).toBeNull();
  });

  it("draws weekly standard points with the weighings in between", () => {
    const rows = growthRows(
      { ...batch, targetSellAgeDays: 35 },
      [log("2026-10-11", { avgWeightGrams: 400 })],
      "2026-10-15",
    );
    expect(rows.map((r) => r.label)).toEqual(["Day 0", "Day 7", "Day 10", "Day 14", "Day 21", "Day 28", "Day 35"]);
    expect(rows[2]).toEqual({ label: "Day 10", standard: 0.374, actual: 0.4 });
    expect(rows[0].actual).toBeNull();
    // Past day 49 the chart stops at the last standard point.
    expect(growthRows({ ...batch, targetSellAgeDays: 42 }, [], "2026-12-30").at(-1)?.label).toBe("Day 49");
  });
});
