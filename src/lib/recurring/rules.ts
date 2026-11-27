// Safe for the browser: no model or database imports here.

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The same day of the next month: `dayOfMonth` (1–31) is the day it's meant for, so a payment due
 * on the 31st falls on the 30th in April and the 28th or 29th in February, then back on the 31st.
 */
export function nextMonthly(date: string, dayOfMonth: number) {
  let year = Number(date.slice(0, 4));
  let month = Number(date.slice(5, 7)) + 1;
  if (month > 12) {
    month = 1;
    year++;
  }
  return `${year}-${pad(month)}-${pad(Math.min(dayOfMonth, daysIn(year, month)))}`;
}

/** `dayOfMonth` in the month `period` ("2027-02"), or its last day if the month is shorter. */
export function onDay(period: string, dayOfMonth: number) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return `${period}-${pad(Math.min(dayOfMonth, daysIn(year, month)))}`;
}

/** Every due date up to and including `today`, from `nextDue`: catching up after missed runs. */
export function dueDates(nextDue: string, dayOfMonth: number, today: string, max = 24) {
  const dates: string[] = [];
  for (let d = nextDue; d <= today && dates.length < max; d = nextMonthly(d, dayOfMonth)) dates.push(d);
  return dates;
}

/** "2026-12-01" → "2026-12": the month an occurrence is for, so each month is made once. */
export const periodOf = (date: string) => date.slice(0, 7);

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
