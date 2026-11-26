/**
 * Calendar dates as "YYYY-MM-DD" strings, in Lagos time (WAT, UTC+1, no daylight saving), so "this
 * month" means the same on every device and on the server. Ranges are inclusive at both ends.
 */
export type ISODate = string;
export type DateRange = { from: ISODate; to: ISODate };

export const PRESETS = [
  { id: "today", label: "Today" },
  { id: "last-7", label: "Last 7 days" },
  { id: "last-30", label: "Last 30 days" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "this-year", label: "This year" },
] as const;
export type PresetId = (typeof PRESETS)[number]["id"];

const LAGOS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Lagos. */
export function today(now: Date = new Date()): ISODate {
  return LAGOS.format(now);
}

/** Date arithmetic on the calendar, through UTC so no device time zone can shift a day. */
const toUTC = (date: ISODate) => new Date(`${date}T00:00:00Z`);
const fromUTC = (date: Date): ISODate => date.toISOString().slice(0, 10);

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

function monthStart(date: ISODate, offset = 0): ISODate {
  const d = toUTC(date);
  return fromUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)));
}

export function presetRange(id: PresetId, on: ISODate = today()): DateRange {
  switch (id) {
    case "today":
      return { from: on, to: on };
    case "last-7":
      return { from: addDays(on, -6), to: on };
    case "last-30":
      return { from: addDays(on, -29), to: on };
    case "this-month":
      return { from: monthStart(on), to: on };
    case "last-month":
      return { from: monthStart(on, -1), to: addDays(monthStart(on), -1) };
    case "this-year":
      return { from: `${on.slice(0, 4)}-01-01`, to: on };
  }
}

/** The preset a range matches today, if any. */
export function matchPreset(range: DateRange, on: ISODate = today()): PresetId | undefined {
  return PRESETS.find(({ id }) => {
    const p = presetRange(id, on);
    return p.from === range.from && p.to === range.to;
  })?.id;
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const FULL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "3–24 Nov 2026", "28 Oct – 3 Nov 2026", "20 Dec 2026 – 4 Jan 2027", "3 Nov 2026". */
export function formatRange({ from, to }: DateRange): string {
  const a = toUTC(from);
  const b = toUTC(to);
  if (from === to) return FULL.format(a);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${DAY.format(a)}–${FULL.format(b)}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `${DAY_MONTH.format(a)} – ${FULL.format(b)}`;
  return `${FULL.format(a)} – ${FULL.format(b)}`;
}

export const isISODate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUTC(toUTC(value)) === value;
