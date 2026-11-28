/**
 * A batch's performance, worked out from its placement and daily logs (browser-safe).
 *
 * - Livability: birds that didn't die or get culled, over birds placed. Birds sold were alive.
 * - Mortality: deaths and culls over birds placed (the two add up to 100%).
 * - Feed per bird: feed eaten over birds that survived (alive now or sold).
 * - FCR: feed over live weight, both at the latest weighing: feed eaten up to that day over the
 *   average weight times the birds that survived to it. Lower is better.
 * - ADG: grams gained a day, from the chick's weight to the latest average.
 * - EPEF: livability (%) × weight (kg) ÷ (age × FCR) × 100. One number for the whole flock;
 *   above 400 is very good for a broiler.
 *
 * A number that can't be worked out yet (no birds, no weighing) is null, never 0. FCR and EPEF
 * also wait until feed is logged for at least 80% of the days up to the weighing: with days
 * missing, the feed total is too low and the numbers look far better than they are.
 */
import { ageOn, daysBetween } from "./rules";
import { addDays } from "@/lib/dates";

export const FEED_COVERAGE = 0.8;

export const CHICK_WEIGHT_GRAMS = 42;

type Batch = { placed: number; placedOn: string; ageAtPlacementDays: number };
type Log = {
  date: string;
  /** The last day a week's or month's log covers. */
  endDate?: string | null;
  deaths: number;
  culls: number;
  sold: number;
  feedKg: number;
  avgWeightGrams: number | null;
};

/**
 * Logs one day each: a week's or month's log is shared evenly across its days (deaths, culls,
 * sold and feed), with its weighing on its last day. Totals are the same; day-by-day numbers
 * (feed up to a weighing, days with feed logged) stay true.
 */
export function spreadLogs<T extends Log>(logs: T[]): Log[] {
  return logs.flatMap((l) => {
    const days = l.endDate ? daysBetween(l.date, l.endDate) + 1 : 1;
    if (days <= 1) return [l];
    return Array.from({ length: days }, (_, i) => ({
      date: addDays(l.date, i),
      deaths: l.deaths / days,
      culls: l.culls / days,
      sold: l.sold / days,
      feedKg: l.feedKg / days,
      avgWeightGrams: i === days - 1 ? l.avgWeightGrams : null,
    }));
  });
}

export type Kpis = {
  livability: number | null;
  mortality: number | null;
  feedKg: number;
  feedPerBirdKg: number | null;
  /** The latest weighing the weight numbers are based on. */
  weighed: { date: string; age: number; grams: number } | null;
  /** Days up to the weighing with no feed logged, when too many are missing for FCR. */
  feedGaps: number;
  fcr: number | null;
  adg: number | null;
  epef: number | null;
};

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

export function batchKpis(batch: Batch, given: Log[]): Kpis {
  const logs = spreadLogs(given);
  const lost = (upTo?: string) =>
    logs.filter((l) => !upTo || l.date <= upTo).reduce((sum, l) => sum + l.deaths + l.culls, 0);
  const feed = (upTo?: string) => logs.filter((l) => !upTo || l.date <= upTo).reduce((sum, l) => sum + l.feedKg, 0);
  const survivors = batch.placed - lost();
  const feedKg = round(feed(), 1);

  const last = logs
    .filter((l) => l.avgWeightGrams && l.avgWeightGrams > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const weighed = last ? { date: last.date, age: ageOn(batch, last.date), grams: last.avgWeightGrams! } : null;

  const livability = batch.placed > 0 ? (survivors / batch.placed) * 100 : null;
  let fcr: number | null = null;
  let adg: number | null = null;
  let epef: number | null = null;
  let feedGaps = 0;
  if (weighed && batch.placed > 0) {
    const days = daysBetween(batch.placedOn, weighed.date) + 1;
    const fed = new Set(logs.filter((l) => l.date <= weighed.date && l.feedKg > 0).map((l) => l.date)).size;
    if (fed < days * FEED_COVERAGE) feedGaps = days - fed;
    const biomassKg = ((batch.placed - lost(weighed.date)) * weighed.grams) / 1000;
    const feedThen = feed(weighed.date);
    fcr = biomassKg > 0 && feedThen > 0 && !feedGaps ? feedThen / biomassKg : null;
    adg = weighed.age > 0 ? (weighed.grams - CHICK_WEIGHT_GRAMS) / weighed.age : null;
    const livabilityThen = ((batch.placed - lost(weighed.date)) / batch.placed) * 100;
    epef = fcr && weighed.age > 0 ? (livabilityThen * (weighed.grams / 1000) * 100) / (weighed.age * fcr) : null;
  }
  return {
    livability: livability === null ? null : round(livability, 1),
    mortality: livability === null ? null : round(100 - livability, 1),
    feedKg,
    feedPerBirdKg: survivors > 0 ? round(feedKg / survivors, 2) : null,
    weighed,
    feedGaps,
    fcr: fcr === null ? null : round(fcr, 2),
    adg: adg === null ? null : round(adg, 1),
    epef: epef === null ? null : Math.round(epef),
  };
}

/** Ross 308 as-hatched average weight (grams) by day, from Aviagen's 2022 objectives. */
export const ROSS_308: [day: number, grams: number][] = [
  [0, 44],
  [7, 214],
  [14, 588],
  [21, 1157],
  [28, 1859],
  [35, 2609],
  [42, 3349],
  [49, 4040],
];

/** The standard weight on a day of age, between the published points. Null outside them. */
export function standardWeight(day: number, curve = ROSS_308): number | null {
  if (day < curve[0][0] || day > curve.at(-1)![0]) return null;
  const i = curve.findIndex(([d]) => d >= day);
  const [d1, g1] = curve[i];
  if (d1 === day) return g1;
  const [d0, g0] = curve[i - 1];
  return Math.round(g0 + ((g1 - g0) * (day - d0)) / (d1 - d0));
}

/** Actual weighings against the standard, one row a week up to the later of today and the target. */
export function growthRows(batch: Batch & { targetSellAgeDays: number }, given: Log[], today: string) {
  const logs = spreadLogs(given);
  const weighings = new Map(
    logs.filter((l) => l.avgWeightGrams && l.avgWeightGrams > 0).map((l) => [ageOn(batch, l.date), l.avgWeightGrams!]),
  );
  const last = Math.min(49, Math.max(batch.targetSellAgeDays, ageOn(batch, today)));
  const days = new Set<number>([
    ...Array.from({ length: Math.floor(last / 7) + 1 }, (_, i) => i * 7),
    ...weighings.keys(),
  ]);
  return [...days]
    .filter((d) => d >= 0 && d <= 49)
    .sort((a, b) => a - b)
    .map((d) => {
      const standard = standardWeight(d);
      return {
        label: `Day ${d}`,
        standard: standard === null ? null : standard / 1000,
        actual: weighings.has(d) ? weighings.get(d)! / 1000 : null,
      };
    });
}

/** How far the latest weighing is from the standard for its age, in percent. */
export function vsStandard(weighed: Kpis["weighed"]) {
  const standard = weighed ? standardWeight(weighed.age) : null;
  return weighed && standard ? round(((weighed.grams - standard) / standard) * 100, 1) : null;
}
