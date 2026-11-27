// Safe for the browser: no model or database imports here.

/** How an advance was handed over: cash or a transfer already, or through Paystack from here. */
export const ADVANCE_PAYMENTS = ["cash", "transfer", "paystack"] as const;
export type AdvancePayment = (typeof ADVANCE_PAYMENTS)[number];
export const MAX_MONTHS = 12;

export type AdvanceInput = {
  employeeId: string;
  date: string;
  amountKobo: number;
  /** Paid back over this many months' pay. */
  months: number;
  /** The first month's pay it comes out of ("2026-11"). */
  firstPeriod: string;
  reason: string;
};

/** What comes out of each month's pay: equal parts, the last one taking what's left. */
export const instalment = (amountKobo: number, months: number) => Math.ceil(amountKobo / months / 100) * 100;

/** "2026-11" → "November 2026". */
export const monthName = (period: string) =>
  new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${period}-01T00:00:00Z`),
  );

export const nextPeriod = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

export function validateAdvance(v: Partial<Record<keyof AdvanceInput, unknown>>, { today }: { today: string }) {
  const errors: Partial<Record<keyof AdvanceInput, string>> = {};
  if (typeof v.employeeId !== "string" || !/^[a-f\d]{24}$/i.test(v.employeeId))
    errors.employeeId = "Choose who it's for.";
  if (typeof v.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) errors.date = "Choose the day.";
  else if (v.date > today) errors.date = "That's in the future.";
  const a = v.amountKobo;
  if (typeof a !== "number" || !Number.isInteger(a) || a < 100 || a > 100_000_000_00)
    errors.amountKobo = "Enter how much.";
  const m = v.months;
  if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > MAX_MONTHS)
    errors.months = `Choose from 1 to ${MAX_MONTHS} months.`;
  if (typeof v.firstPeriod !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v.firstPeriod))
    errors.firstPeriod = "Choose which month's pay it comes out of.";
  else if (typeof v.date === "string" && v.firstPeriod < v.date.slice(0, 7))
    errors.firstPeriod = "It can't come out of pay before it was given.";
  if (typeof v.reason !== "string" || v.reason.length > 200) errors.reason = "Keep it under 200 characters.";
  return errors;
}
