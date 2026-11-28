import { describe, expect, it } from "vitest";

import { spanChoices, spanDays, spanLabel, validateLog } from "./rules";
import { createLog, listLogs, logTotals, updateLog } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { batchKpis, growthRows, spreadLogs } from "@/lib/batches/kpis";
import { createHouse } from "@/lib/houses/service";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-26"; // A Thursday.
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string; message: string }) => ({
      status: e.status,
      code: e.code,
      field: e.field,
      message: e.message,
    }),
  );

describe("log spans: the rules", () => {
  it("offers calendar weeks and months, cut to the batch's first day and to today", () => {
    expect(spanChoices("week", TODAY, "2026-11-02")).toEqual([
      { from: "2026-11-23", to: TODAY, label: "This week" },
      { from: "2026-11-16", to: "2026-11-22", label: "Last week" },
      { from: "2026-11-09", to: "2026-11-15", label: "Week of 9 Nov" },
      { from: "2026-11-02", to: "2026-11-08", label: "Week of 2 Nov" },
    ]);
    // Placed mid-week: the first week starts the day the chicks came.
    expect(spanChoices("week", TODAY, "2026-11-12").at(-1)).toEqual({
      from: "2026-11-12",
      to: "2026-11-15",
      label: "Week of 9 Nov",
    });
    expect(spanChoices("month", TODAY, "2026-09-20")).toEqual([
      { from: "2026-11-01", to: TODAY, label: "This month" },
      { from: "2026-10-01", to: "2026-10-31", label: "Last month" },
      { from: "2026-09-20", to: "2026-09-30", label: "September" },
    ]);
    expect([spanDays("2026-11-23", TODAY), spanDays(TODAY, null)]).toEqual([4, 1]);
    expect([spanLabel("2026-11-23", "2026-11-29"), spanLabel(TODAY, null), spanLabel(TODAY, TODAY)]).toEqual([
      "23 Nov to 29 Nov",
      "26 Nov",
      "26 Nov",
    ]);
  });

  it("checks a span's last day", () => {
    const base = { batchId: "b", date: "2026-11-02", deaths: 0, culls: 0, sold: 0, feedKg: 0, feedType: "", notes: "" };
    const err = (endDate: unknown) => validateLog({ ...base, endDate }, { today: TODAY }).endDate;
    expect([err(null), err("2026-11-08")]).toEqual([undefined, undefined]);
    expect(err("2026-11-01")).toBe("Choose the last day it covers.");
    expect(err("nope")).toBe("Choose the last day it covers.");
    expect(err("2026-11-27")).toBe("It can cover up to today, not the future.");
    expect(validateLog({ ...base, date: "2026-10-01", endDate: "2026-11-02" }, { today: TODAY }).endDate).toBe(
      "A log covers 31 days at most.",
    );
  });
});

describe("log spans: the record", () => {
  async function farm() {
    const owner: CurrentUser = {
      id: String(oid()),
      farmId: String(oid()),
      name: "Ada",
      email: "a@f.com",
      role: "owner",
    };
    const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
    const { batch } = await createBatch(
      owner,
      {
        houseId: house.id,
        placedOn: "2026-11-02",
        breed: "Ross 308",
        delivered: 1000,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
      },
      {},
      TODAY,
    );
    return { owner, batch };
  }

  it("logs a week in one go; no day in it can be logged again, the days around it can", async () => {
    const { owner, batch } = await farm();
    const week = await createLog(
      owner,
      { batchId: batch.id, date: "2026-11-02", endDate: "2026-11-08", deaths: 14, feedKg: 350 },
      {},
      TODAY,
    );
    expect(week.log).toMatchObject({ date: "2026-11-02", endDate: "2026-11-08", deaths: 14 });
    expect(
      await refusal(createLog(owner, { batchId: batch.id, date: "2026-11-05", deaths: 1 }, {}, TODAY)),
    ).toMatchObject({
      code: "already_logged",
      message: "This batch already has a log for 2026-11-05. Open it to make changes.",
    });
    expect(
      await refusal(createLog(owner, { batchId: batch.id, date: "2026-11-01", endDate: "2026-11-03" }, {}, TODAY)),
    ).toMatchObject({ field: "date" });
    expect(
      await refusal(createLog(owner, { batchId: batch.id, date: "2026-11-08", endDate: "2026-11-14" }, {}, TODAY)),
    ).toMatchObject({ code: "already_logged", message: expect.stringContaining("some of 8 Nov to 14 Nov") });
    const day = await createLog(owner, { batchId: batch.id, date: "2026-11-09", deaths: 1, feedKg: 60 }, {}, TODAY);
    expect(day.log.endDate).toBeNull();
    // A span of one day is a day.
    const one = await createLog(owner, { batchId: batch.id, date: "2026-11-10", endDate: "2026-11-10" }, {}, TODAY);
    expect(one.log.endDate).toBeNull();

    // Totals count every day the week covers.
    expect((await logTotals(owner.farmId, [batch.id])).get(batch.id)).toMatchObject({
      deaths: 15,
      feedKg: 410,
      days: 9,
    });
    // Moving the day log into the week is refused; stretching the week over it too.
    expect(
      await refusal(updateLog(owner, day.log.id, { batchId: batch.id, date: "2026-11-07" }, day.log.version, TODAY)),
    ).toMatchObject({
      code: "already_logged",
    });
    expect(
      await refusal(
        updateLog(
          owner,
          week.log.id,
          { batchId: batch.id, date: "2026-11-02", endDate: "2026-11-09", deaths: 14, feedKg: 350 },
          week.log.version,
          TODAY,
        ),
      ),
    ).toMatchObject({ code: "already_logged" });
    // Editing the week itself is fine.
    const edited = await updateLog(
      owner,
      week.log.id,
      { batchId: batch.id, date: "2026-11-02", endDate: "2026-11-08", deaths: 12, feedKg: 350 },
      week.log.version,
      TODAY,
    );
    expect(edited.deaths).toBe(12);
    expect((await listLogs(owner.farmId, batch.id)).map((l) => [l.date, l.endDate])).toEqual([
      ["2026-11-10", null],
      ["2026-11-09", null],
      ["2026-11-02", "2026-11-08"],
    ]);
  });
});

describe("log spans: the numbers", () => {
  const batch = { placed: 1000, placedOn: "2026-11-02", ageAtPlacementDays: 0, targetSellAgeDays: 42 };
  it("shares a week across its days, with its weighing on the last day: totals and KPIs as if logged daily", () => {
    const week = {
      date: "2026-11-02",
      endDate: "2026-11-08",
      deaths: 14,
      culls: 7,
      sold: 0,
      feedKg: 350,
      avgWeightGrams: 190,
    };
    const spread = spreadLogs([week]);
    expect(spread).toHaveLength(7);
    expect(spread[0]).toMatchObject({ date: "2026-11-02", deaths: 2, culls: 1, feedKg: 50, avgWeightGrams: null });
    expect(spread[6]).toMatchObject({ date: "2026-11-08", avgWeightGrams: 190 });
    const daily = spread.map((d, i) => ({ ...d, avgWeightGrams: i === 6 ? 190 : null }));
    expect(batchKpis(batch, [week])).toEqual(batchKpis(batch, daily));
    expect(batchKpis(batch, [week])).toMatchObject({
      mortality: 2.1,
      feedKg: 350,
      weighed: { date: "2026-11-08", age: 6 },
    });
    expect(growthRows(batch, [week], TODAY).find((r) => r.label === "Day 6")).toMatchObject({ actual: 0.19 });
    expect(spreadLogs([{ ...week, endDate: null }])).toHaveLength(1);
  });
});
