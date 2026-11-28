// Safe for the browser: no model or database imports here.
import type { MinPer, Pricing } from "./rules";
import { addDays } from "@/lib/dates";

/**
 * How a contract is going, worked out from its orders, invoices and payments: what was promised
 * in each week or month of it, what the customer ordered, what the farm delivered, what's left,
 * where it's heading, and whether either side is falling short. Pure: the service feeds it.
 */

export type FulfilmentContract = {
  startDate: string;
  endDate: string;
  terminatedOn: string | null;
  minBirds: number | null;
  minPer: MinPer;
  termsDays: number;
  pricing: Pricing;
  priceKobo: number;
};
export type FulfilmentOrder = { deliveryDate: string; status: string; birds: number; totalKobo: number };
export type FulfilmentInvoice = {
  number: string;
  issueDate: string;
  dueDate: string;
  totalKobo: number;
  paidKobo: number;
  /** When it was paid off, if it was: the day of the payment that cleared it. */
  paidOn: string | null;
};

export type Period = {
  start: string;
  end: string;
  /** Over, running now, or still to come. */
  state: "done" | "current" | "future";
  promised: number | null;
  ordered: number;
  delivered: number;
  /** Birds the customer ordered for this period that the farm didn't deliver (periods that are over). */
  farmShort: number;
  /** Birds under the agreed minimum the customer didn't order (periods that are over). */
  customerShort: number;
};

export type Side = {
  /** Keeping to it, falling short, or too early to tell. */
  state: "keeping" | "behind" | "not_yet";
  headline: string;
  /** Each way they're falling short, in a sentence. */
  reasons: string[];
};

export type Fulfilment = {
  periods: Period[];
  /** Over, running, or yet to start. */
  phase: "upcoming" | "running" | "ended";
  daysIn: number;
  daysTotal: number;
  promisedToDate: number | null;
  orderedToDate: number;
  deliveredToDate: number;
  /** Delivered against promised (or, with no minimum, against ordered), 0–100; null when nothing was due. */
  rate: number | null;
  /** Birds still to promise in this period and the ones after it. */
  promisedLeft: number | null;
  /** Birds on orders still to deliver. */
  bookedAhead: number;
  /** Where deliveries are heading at the recent pace, by the end. */
  projectedTotal: number;
  promisedTotal: number | null;
  valueDeliveredKobo: number;
  billedKobo: number;
  paidKobo: number;
  outstandingKobo: number;
  overdueKobo: number;
  overdueInvoices: { number: string; dueDate: string; daysLate: number; owedKobo: number }[];
  /** Average days from invoice to paid in full, for invoices paid off. */
  avgDaysToPay: number | null;
  farm: Side;
  customer: Side;
};

const DELIVERED = new Set(["delivered", "invoiced"]);
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const daysFrom = (a: string, b: string) => Math.round(day(b) - day(a));
const birdsText = (n: number) => `${n.toLocaleString("en-NG")} bird${n === 1 ? "" : "s"}`;

/** The same day `n` months on, kept inside the month (31 Jan + 1 month is 28 Feb). */
export function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

/** The contract's weeks or months, from its start to the day it ends (or ended). */
export function periodsOf(c: Pick<FulfilmentContract, "startDate" | "endDate" | "terminatedOn" | "minPer">) {
  const last = c.terminatedOn && c.terminatedOn < c.endDate ? c.terminatedOn : c.endDate;
  const out: { start: string; end: string }[] = [];
  for (let i = 0, start = c.startDate; start <= last && i < 600; i++) {
    const next = c.minPer === "month" ? addMonths(c.startDate, i + 1) : addDays(start, 7);
    const end = addDays(next, -1);
    out.push({ start, end: end > last ? last : end });
    start = next;
  }
  return out;
}

export function fulfilment(
  c: FulfilmentContract,
  orders: FulfilmentOrder[],
  invoices: FulfilmentInvoice[],
  today: string,
): Fulfilment {
  const live = orders.filter((o) => o.status !== "cancelled");
  const periods: Period[] = periodsOf(c).map(({ start, end }) => {
    const state = end < today ? "done" : start <= today ? "current" : "future";
    const inside = live.filter((o) => o.deliveryDate >= start && o.deliveryDate <= end);
    const ordered = inside.reduce((n, o) => n + o.birds, 0);
    const delivered = inside.filter((o) => DELIVERED.has(o.status)).reduce((n, o) => n + o.birds, 0);
    const done = state === "done";
    return {
      start,
      end,
      state,
      promised: c.minBirds,
      ordered,
      delivered,
      farmShort: done ? Math.max(0, ordered - delivered) : 0,
      customerShort: done && c.minBirds ? Math.max(0, c.minBirds - ordered) : 0,
    };
  });

  const last = periods.at(-1)?.end ?? c.endDate;
  const phase = today < c.startDate ? "upcoming" : today > last ? "ended" : "running";
  const done = periods.filter((p) => p.state === "done");
  const left = periods.filter((p) => p.state !== "done");
  const sum = (ps: Period[], k: "ordered" | "delivered" | "farmShort" | "customerShort") =>
    ps.reduce((n, p) => n + p[k], 0);
  // What was due so far counts the running period too: its birds are owed by its end.
  const due = periods.filter((p) => p.state !== "future");
  const promisedToDate = c.minBirds ? done.length * c.minBirds : null;
  const orderedToDate = sum(due, "ordered");
  const deliveredToDate = sum(due, "delivered");
  const base = promisedToDate ?? sum(done, "ordered");
  const rate = base ? Math.min(100, Math.round((sum(done, "delivered") / base) * 100)) : null;
  const recent = done.slice(-4);
  const pace = recent.length ? sum(recent, "delivered") / recent.length : 0;
  const bookedAhead = live
    .filter((o) => o.status === "pending" && o.deliveryDate >= today)
    .reduce((n, o) => n + o.birds, 0);

  const valueDeliveredKobo = live.filter((o) => DELIVERED.has(o.status)).reduce((n, o) => n + o.totalKobo, 0);
  const billedKobo = invoices.reduce((n, i) => n + i.totalKobo, 0);
  const paidKobo = invoices.reduce((n, i) => n + i.paidKobo, 0);
  const overdueInvoices = invoices
    .filter((i) => i.totalKobo > i.paidKobo && i.dueDate < today)
    .map((i) => ({
      number: i.number,
      dueDate: i.dueDate,
      daysLate: daysFrom(i.dueDate, today),
      owedKobo: i.totalKobo - i.paidKobo,
    }))
    .sort((a, b) => b.daysLate - a.daysLate);
  const overdueKobo = overdueInvoices.reduce((n, i) => n + i.owedKobo, 0);
  const paidOff = invoices.filter((i) => i.paidOn && i.paidKobo >= i.totalKobo);
  const avgDaysToPay = paidOff.length
    ? Math.round(paidOff.reduce((n, i) => n + daysFrom(i.issueDate, i.paidOn!), 0) / paidOff.length)
    : null;
  const paidLate = paidOff.filter((i) => i.paidOn! > i.dueDate).length;

  const farmShort = sum(done, "farmShort");
  const shortPeriods = done.filter((p) => p.farmShort > 0).length;
  const unit = c.minPer === "month" ? "month" : "week";
  const farm: Side = !done.length
    ? { state: "not_yet", headline: "Too early to tell", reasons: [] }
    : farmShort
      ? {
          state: "behind",
          headline: "We are behind",
          reasons: [
            `We delivered ${birdsText(farmShort)} fewer than they ordered, in ${shortPeriods} ${unit}${shortPeriods === 1 ? "" : "s"}.`,
          ],
        }
      : { state: "keeping", headline: "We are keeping to it", reasons: [] };

  const customerShort = sum(done, "customerShort");
  const underPeriods = done.filter((p) => p.customerShort > 0).length;
  const reasons = [
    ...(customerShort
      ? [
          `They ordered ${birdsText(customerShort)} under the ${birdsText(c.minBirds!)} a ${unit} agreed, in ${underPeriods} ${unit}${underPeriods === 1 ? "" : "s"}.`,
        ]
      : []),
    ...(overdueInvoices.length
      ? [
          `${overdueInvoices.length === 1 ? "An invoice is" : `${overdueInvoices.length} invoices are`} past due, the oldest by ${overdueInvoices[0].daysLate} day${overdueInvoices[0].daysLate === 1 ? "" : "s"}.`,
        ]
      : []),
    ...(paidLate
      ? [
          `${paidLate} of ${paidOff.length} paid invoice${paidOff.length === 1 ? " was" : "s were"} paid after the due date.`,
        ]
      : []),
  ];
  const customer: Side =
    !done.length && !invoices.length
      ? { state: "not_yet", headline: "Too early to tell", reasons: [] }
      : customerShort || overdueInvoices.length
        ? {
            state: "behind",
            headline:
              customerShort && overdueInvoices.length
                ? "They are ordering less and paying late"
                : customerShort
                  ? "They are ordering less than agreed"
                  : "They are paying late",
            reasons,
          }
        : { state: "keeping", headline: "They are keeping to it", reasons };

  return {
    periods,
    phase,
    daysIn: Math.max(0, Math.min(daysFrom(c.startDate, today) + 1, daysFrom(c.startDate, last) + 1)),
    daysTotal: daysFrom(c.startDate, last) + 1,
    promisedToDate,
    orderedToDate,
    deliveredToDate,
    rate,
    promisedLeft: c.minBirds ? left.length * c.minBirds : null,
    bookedAhead,
    projectedTotal: Math.round(deliveredToDate + pace * left.filter((p) => p.state === "future").length),
    promisedTotal: c.minBirds ? periods.length * c.minBirds : null,
    valueDeliveredKobo,
    billedKobo,
    paidKobo,
    outstandingKobo: billedKobo - paidKobo,
    overdueKobo,
    overdueInvoices,
    avgDaysToPay,
    farm,
    customer,
  };
}
