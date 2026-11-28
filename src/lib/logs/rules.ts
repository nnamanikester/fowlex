/**
 * Daily log rules, shared by the phone form and the server. Browser-safe. Dates are Lagos days.
 */
import { addDays, isISODate } from "@/lib/dates";

/** Broiler feed phases, offered as suggestions. */
export const FEED_TYPES = ["Pre-starter", "Starter", "Grower", "Finisher"];
/** Nigerian feed comes in 25 kg bags. */
export const BAG_KG = 25;

export type LogInput = {
  batchId: string;
  /** The day it's for, or the first day of the week or month it covers. */
  date: string;
  /** The last day it covers, for a week or a month; null for one day. */
  endDate: string | null;
  deaths: number;
  culls: number;
  sold: number;
  feedKg: number;
  feedType: string;
  /** The feed item the kg came out of, so stock goes down; null when not tracked. */
  feedItemId: string | null;
  waterLitres: number | null;
  avgWeightGrams: number | null;
  notes: string;
};

/** How long a log covers: one day, or a week or a month logged together. */
export const SPANS = ["day", "week", "month"] as const;
export type Span = (typeof SPANS)[number];
export const SPAN_LABELS: Record<Span, string> = { day: "A day", week: "A week", month: "A month" };
/** The longest a log may cover. */
export const MAX_SPAN_DAYS = 31;

const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
/** Days from `from` to `to`, both counted. */
export const spanDays = (from: string, to: string | null) =>
  to ? Math.round((utc(to) - utc(from)) / 86_400_000) + 1 : 1;

/**
 * The weeks or months to choose from, most recent first: calendar weeks (Monday to Sunday) and
 * months, cut to the batch's first day and to today (so "this week" runs to today).
 */
export function spanChoices(span: Exclude<Span, "day">, today: string, placedOn: string, count = 4) {
  const out: { from: string; to: string; label: string }[] = [];
  const weekday = (new Date(utc(today)).getUTCDay() + 6) % 7; // Monday is 0.
  for (let i = 0; i < count; i++) {
    let from: string;
    let to: string;
    if (span === "week") {
      from = addDays(today, -weekday - 7 * i);
      to = addDays(from, 6);
    } else {
      const [y, m] = today.split("-").map(Number);
      const first = new Date(Date.UTC(y, m - 1 - i, 1));
      from = first.toISOString().slice(0, 10);
      to = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    }
    if (to < placedOn) break;
    const label =
      span === "week"
        ? i === 0
          ? "This week"
          : i === 1
            ? "Last week"
            : `Week of ${shortDay(from)}`
        : i === 0
          ? "This month"
          : i === 1
            ? "Last month"
            : monthName(from);
    out.push({ from: from < placedOn ? placedOn : from, to: to > today ? today : to, label });
  }
  return out;
}
const shortDay = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(utc(d)));
const monthName = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(utc(d)));
/** "23 Nov" for a day, "23 to 29 Nov" for a span. */
export const spanLabel = (from: string, to: string | null) =>
  !to || to === from ? shortDay(from) : `${shortDay(from)} to ${shortDay(to)}`;

/** The feed a batch of this age usually eats: starter for three weeks, finisher after. */
export const suggestedFeed = (ageDays: number) =>
  ageDays <= 10 ? "Pre-starter" : ageDays <= 21 ? "Starter" : ageDays <= 28 ? "Grower" : "Finisher";

/** "3.5 bags" for 87.5 kg. */
export const bags = (kg: number) => `${Math.round((kg / BAG_KG) * 10) / 10} bag${kg === BAG_KG ? "" : "s"}`;

const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const amount = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;

/**
 * Field → message. `context` is what the server knows: the batch's placement day, today, and how
 * many birds were alive before this log (so a log can't remove more than there are).
 */
export function validateLog(
  input: Partial<Record<keyof LogInput, unknown>>,
  context: { today: string; placedOn?: string; aliveBefore?: number },
) {
  const errors: Partial<Record<keyof LogInput, string>> = {};
  if (typeof input.batchId !== "string" || !input.batchId) errors.batchId = "Choose the batch.";

  const date = input.date;
  if (typeof date !== "string" || !isISODate(date)) errors.date = "Choose the day.";
  else if (date > context.today) errors.date = "Log today or an earlier day, not the future.";
  else if (context.placedOn && date < context.placedOn) errors.date = `This batch was placed on ${context.placedOn}.`;
  const end = input.endDate;
  if (end !== null && end !== undefined && !errors.date) {
    if (typeof end !== "string" || !isISODate(end) || end < (date as string))
      errors.endDate = "Choose the last day it covers.";
    else if (end > context.today) errors.endDate = "It can cover up to today, not the future.";
    else if (spanDays(date as string, end) > MAX_SPAN_DAYS)
      errors.endDate = `A log covers ${MAX_SPAN_DAYS} days at most.`;
  }

  for (const field of ["deaths", "culls", "sold"] as const)
    if (!count(input[field])) errors[field] = "Enter 0 or more, as a whole number.";

  if (!amount(input.feedKg, 100_000)) errors.feedKg = "Enter the feed used in kg (0 if none).";
  else if (Math.round((input.feedKg as number) * 10) !== (input.feedKg as number) * 10)
    errors.feedKg = "Use one decimal place at most.";
  if (typeof input.feedType !== "string" || input.feedType.length > 40) errors.feedType = "Use at most 40 characters.";
  const item = input.feedItemId;
  if (item !== null && item !== undefined && (typeof item !== "string" || !/^[a-f\d]{24}$/i.test(item)))
    errors.feedItemId = "Choose a feed from your stock.";
  if (input.waterLitres !== null && input.waterLitres !== undefined && !amount(input.waterLitres, 1_000_000))
    errors.waterLitres = "Enter litres, or leave it empty.";
  const weight = input.avgWeightGrams;
  if (weight !== null && weight !== undefined && (!count(weight) || weight < 20 || weight > 8000))
    errors.avgWeightGrams = "Enter the average weight in grams (20 to 8,000), or leave it empty.";
  if (typeof input.notes !== "string" || input.notes.length > 500) errors.notes = "Use at most 500 characters.";

  const removed = [input.deaths, input.culls, input.sold].every(count)
    ? (input.deaths as number) + (input.culls as number) + (input.sold as number)
    : 0;
  if (context.aliveBefore !== undefined && removed > context.aliveBefore && !errors.deaths)
    errors.deaths = `Only ${context.aliveBefore.toLocaleString("en-NG")} birds were left; deaths, culls and sold add up to ${removed.toLocaleString("en-NG")}.`;
  return errors;
}
