import { describe, expect, it } from "vitest";

import {
  BROILER_SCHEDULE,
  needsAttention,
  scheduleFor,
  validateHealth,
  vaccinationPlan,
  withdrawalEnds,
  withdrawalUntil,
} from "./rules";

const batch = { breed: "Ross 308", placedOn: "2026-11-01", ageAtPlacementDays: 0, status: "active" };
const on = (day: number) => `2026-11-${String(1 + day).padStart(2, "0")}`;
const states = (plan: ReturnType<typeof vaccinationPlan>) => Object.fromEntries(plan.map((d) => [d.key, d.state]));

describe("vaccination programme", () => {
  it("shows the day-7 Newcastle vaccination as due on day 7", () => {
    const plan = vaccinationPlan(batch, new Map(), on(7));
    expect(states(plan)).toEqual({ "nd-1": "due", "ibd-1": "upcoming", "nd-2": "upcoming", "ibd-2": "upcoming" });
    expect(needsAttention(plan).map((d) => d.vaccine)).toEqual(["Newcastle (Lasota or B1)"]);
    expect(plan[0].dueOn).toBe("2026-11-08");
  });

  it("is due from a day early, overdue two days late, and given once recorded", () => {
    expect(states(vaccinationPlan(batch, new Map(), on(5)))["nd-1"]).toBe("upcoming");
    expect(states(vaccinationPlan(batch, new Map(), on(6)))["nd-1"]).toBe("due");
    expect(states(vaccinationPlan(batch, new Map(), on(9)))["nd-1"]).toBe("due");
    expect(states(vaccinationPlan(batch, new Map(), on(10)))["nd-1"]).toBe("overdue");
    const plan = vaccinationPlan(batch, new Map([["nd-1", on(7)]]), on(15));
    expect(plan[0]).toMatchObject({ state: "given", givenOn: on(7) });
    expect(needsAttention(plan).map((d) => d.key)).toEqual(["ibd-1"]);
  });

  it("lists the most overdue first", () => {
    expect(needsAttention(vaccinationPlan(batch, new Map(), on(22))).map((d) => [d.key, d.state])).toEqual([
      ["nd-1", "overdue"],
      ["ibd-1", "overdue"],
      ["nd-2", "due"],
    ]);
  });

  it("counts from the age birds arrived at, and leaves earlier doses to the seller", () => {
    const started = { ...batch, ageAtPlacementDays: 10 };
    const plan = vaccinationPlan(started, new Map(), "2026-11-05");
    expect(states(plan)).toEqual({ "nd-1": "before-arrival", "ibd-1": "due", "nd-2": "upcoming", "ibd-2": "upcoming" });
  });

  it("has nothing due on a closed batch, and one programme for every broiler breed", () => {
    expect(needsAttention(vaccinationPlan({ ...batch, status: "closed" }, new Map(), on(30)))).toEqual([]);
    expect(scheduleFor("Cobb 500")).toBe(BROILER_SCHEDULE);
    expect(scheduleFor("Local cross")).toBe(BROILER_SCHEDULE);
  });
});

describe("withdrawal", () => {
  it("keeps birds from sale until the latest drug has cleared", () => {
    expect(withdrawalEnds({ date: "2026-11-20", withdrawalDays: 5 })).toBe("2026-11-25");
    expect(withdrawalEnds({ date: "2026-11-20", withdrawalDays: 0 })).toBeNull();
    const events = [
      { date: "2026-11-10", withdrawalDays: 3 },
      { date: "2026-11-20", withdrawalDays: 7 },
      { date: "2026-11-22", withdrawalDays: 2 },
    ];
    expect(withdrawalUntil(events, "2026-11-24")).toBe("2026-11-27");
    expect(withdrawalUntil(events, "2026-11-28")).toBeNull();
  });
});

describe("validateHealth", () => {
  const good = {
    batchId: "b1",
    date: "2026-11-08",
    kind: "vaccination",
    product: "Lasota",
    scheduleKey: "nd-1",
    route: "Eye drop",
    dose: "1 drop",
    givenBy: "Tunde",
    costKobo: 450_000,
    withdrawalDays: 0,
    notes: "",
  };
  const ctx = { today: "2026-11-26", placedOn: "2026-11-01" };

  it("accepts a vaccination, medication and a vet visit with notes", () => {
    expect(validateHealth(good, ctx)).toEqual({});
    expect(validateHealth({ ...good, kind: "medication", scheduleKey: null, withdrawalDays: 5 }, ctx)).toEqual({});
    expect(
      validateHealth({ ...good, kind: "vet-visit", product: "", scheduleKey: null, notes: "Coccidiosis" }, ctx),
    ).toEqual({});
  });

  it.each([
    ["batchId", ""],
    ["date", "2026-11-27"],
    ["date", "2026-10-31"],
    ["date", "soon"],
    ["kind", "surgery"],
    ["product", ""],
    ["product", "x".repeat(121)],
    ["route", 4],
    ["notes", "x".repeat(501)],
    ["costKobo", -1],
    ["costKobo", 1.5],
    ["withdrawalDays", 91],
    ["withdrawalDays", -1],
    ["scheduleKey", 7],
  ])("refuses %s = %j", (field, value) => {
    expect(validateHealth({ ...good, [field]: value }, ctx)).toHaveProperty(field);
  });

  it("only counts vaccinations towards the programme, and needs a vet's findings", () => {
    expect(validateHealth({ ...good, kind: "medication" }, ctx)).toHaveProperty("scheduleKey");
    expect(validateHealth({ ...good, kind: "vet-visit", product: "", scheduleKey: null }, ctx)).toHaveProperty("notes");
  });
});
