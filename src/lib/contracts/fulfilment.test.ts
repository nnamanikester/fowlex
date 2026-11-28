import { describe, expect, it } from "vitest";

import { addMonths, fulfilment, type FulfilmentContract, periodsOf } from "./fulfilment";

/** 200 birds a week from Monday 2 Nov 2026 to 31 Dec 2026, paid in 7 days. */
const contract = (over: Partial<FulfilmentContract> = {}): FulfilmentContract => ({
  startDate: "2026-11-02",
  endDate: "2026-12-31",
  terminatedOn: null,
  minBirds: 200,
  minPer: "week",
  termsDays: 7,
  pricing: "perBird",
  priceKobo: 700_000,
  ...over,
});
const order = (deliveryDate: string, birds: number, status = "delivered") => ({
  deliveryDate,
  status,
  birds,
  totalKobo: birds * 700_000,
});
const TODAY = "2026-11-28"; // In the fourth week (23–29 Nov); three weeks are over.

describe("contract periods", () => {
  it("splits a contract into its weeks or months, ending on its last day", () => {
    const weeks = periodsOf(contract());
    expect(weeks[0]).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(weeks.at(-1)).toEqual({ start: "2026-12-28", end: "2026-12-31" });
    expect(weeks).toHaveLength(9);
    expect(periodsOf(contract({ minPer: "month", startDate: "2026-01-31", endDate: "2026-04-15" }))).toEqual([
      { start: "2026-01-31", end: "2026-02-27" },
      { start: "2026-02-28", end: "2026-03-30" },
      { start: "2026-03-31", end: "2026-04-15" },
    ]);
    // Ended early: the periods stop on the day it ended.
    expect(periodsOf(contract({ terminatedOn: "2026-11-10" })).at(-1)).toEqual({
      start: "2026-11-09",
      end: "2026-11-10",
    });
    expect([addMonths("2026-01-31", 1), addMonths("2026-12-15", 1)]).toEqual(["2026-02-28", "2027-01-15"]);
  });
});

describe("fulfilment", () => {
  it("both sides keeping to it: promised, delivered, what's left and where it's heading", () => {
    const f = fulfilment(
      contract(),
      [
        order("2026-11-04", 200),
        order("2026-11-11", 220),
        order("2026-11-18", 200),
        order("2026-11-30", 200, "pending"),
      ],
      [
        {
          number: "INV-1",
          issueDate: "2026-11-04",
          dueDate: "2026-11-11",
          totalKobo: 140_000_000,
          paidKobo: 140_000_000,
          paidOn: "2026-11-09",
        },
      ],
      TODAY,
    );
    expect(f).toMatchObject({
      phase: "running",
      promisedToDate: 600,
      deliveredToDate: 620,
      rate: 100,
      promisedLeft: 1200,
      bookedAhead: 200,
      promisedTotal: 1800,
      avgDaysToPay: 5,
      farm: { state: "keeping" },
      customer: { state: "keeping", reasons: [] },
    });
    expect(f.periods.map((p) => p.state).slice(0, 5)).toEqual(["done", "done", "done", "current", "future"]);
    // 620 so far, at about 207 a week for the 5 weeks still to come.
    expect(f.projectedTotal).toBe(620 + Math.round((620 / 3) * 5));
    expect(f.valueDeliveredKobo).toBe(620 * 700_000);
  });

  it("we are behind: they ordered, we delivered less", () => {
    const f = fulfilment(
      contract(),
      [
        order("2026-11-04", 200),
        order("2026-11-11", 150),
        order("2026-11-12", 50, "pending"),
        order("2026-11-18", 200),
      ],
      [],
      TODAY,
    );
    expect(f.farm).toEqual({
      state: "behind",
      headline: "We are behind",
      reasons: ["We delivered 50 birds fewer than they ordered, in 1 week."],
    });
    expect(f.customer.state).toBe("keeping");
    expect(f.rate).toBe(92);
  });

  it("the customer is behind: ordering under the minimum, and paying late", () => {
    const f = fulfilment(
      contract(),
      [
        order("2026-11-04", 120),
        order("2026-11-11", 200),
        order("2026-11-18", 100),
        order("2026-11-19", 50, "cancelled"),
      ],
      [
        {
          number: "INV-1",
          issueDate: "2026-11-04",
          dueDate: "2026-11-11",
          totalKobo: 84_000_000,
          paidKobo: 0,
          paidOn: null,
        },
        {
          number: "INV-2",
          issueDate: "2026-11-11",
          dueDate: "2026-11-18",
          totalKobo: 140_000_000,
          paidKobo: 140_000_000,
          paidOn: "2026-11-25",
        },
      ],
      TODAY,
    );
    expect(f.customer.state).toBe("behind");
    expect(f.customer.headline).toBe("They are ordering less and paying late");
    expect(f.customer.reasons).toEqual([
      "They ordered 180 birds under the 200 birds a week agreed, in 2 weeks.",
      "An invoice is past due, the oldest by 17 days.",
      "1 of 1 paid invoice was paid after the due date.",
    ]);
    expect(f.overdueInvoices).toEqual([{ number: "INV-1", dueDate: "2026-11-11", daysLate: 17, owedKobo: 84_000_000 }]);
    expect(f).toMatchObject({ overdueKobo: 84_000_000, outstandingKobo: 84_000_000, avgDaysToPay: 14 });
    expect(f.farm.state).toBe("keeping");
  });

  it("only paying late, only under-ordering, two late invoices", () => {
    const late = (n: string) => ({
      number: n,
      issueDate: "2026-11-01",
      dueDate: "2026-11-08",
      totalKobo: 10,
      paidKobo: 0,
      paidOn: null,
    });
    expect(fulfilment(contract({ minBirds: null }), [], [late("A"), late("B")], TODAY).customer).toMatchObject({
      headline: "They are paying late",
      reasons: ["2 invoices are past due, the oldest by 20 days."],
    });
    expect(fulfilment(contract(), [order("2026-11-04", 199)], [], TODAY).customer.headline).toBe(
      "They are ordering less than agreed",
    );
  });

  it("before it starts, too early to tell; with no minimum, the rate is against what they ordered", () => {
    const early = fulfilment(contract({ startDate: "2026-12-07" }), [], [], TODAY);
    expect(early).toMatchObject({
      phase: "upcoming",
      daysIn: 0,
      rate: null,
      farm: { state: "not_yet" },
      customer: { state: "not_yet" },
    });
    const open = fulfilment(
      contract({ minBirds: null }),
      [order("2026-11-04", 100), order("2026-11-05", 100, "pending")],
      [],
      TODAY,
    );
    expect(open).toMatchObject({ promisedToDate: null, promisedLeft: null, promisedTotal: null, rate: 50 });
    expect(fulfilment(contract({ endDate: "2026-11-15" }), [], [], TODAY).phase).toBe("ended");
  });
});
