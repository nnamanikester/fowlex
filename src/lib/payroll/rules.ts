// Safe for the browser: no model or database imports here.
import type { PayType } from "@/lib/people/rules";

/** A run's state: being worked out, then approved, and paid as each payslip is. */
export type PayState = "draft" | "to-pay" | "part-paid" | "paid";
export const PAY_STATE_LABELS: Record<PayState, string> = {
  draft: "Not approved yet",
  "to-pay": "To pay",
  "part-paid": "Partly paid",
  paid: "Paid",
};

/** What changes one person's pay this month, beyond what's worked out. */
export type Adjustment = { bonusKobo: number; deductionKobo: number; deductionNote: string; excluded: boolean };
export const NO_ADJUSTMENT: Adjustment = { bonusKobo: 0, deductionKobo: 0, deductionNote: "", excluded: false };

export type PayLine = {
  employeeId: string;
  name: string;
  job: string;
  payType: PayType;
  rateKobo: number;
  /** Days worked, batches closed, or the share of the month (monthly pay). */
  units: number;
  /** How the pay was worked out, in words: "21 days × ₦4,000.00". */
  basis: string;
  grossKobo: number;
  /** What came out for advances, and from which. */
  advances: { advanceId: string; amountKobo: number }[];
  advanceKobo: number;
  netKobo: number;
  hasBank: boolean;
  batchIds: string[];
} & Adjustment;

export const daysIn = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const periodStart = (period: string) => `${period}-01`;
export const periodEnd = (period: string) => `${period}-${String(daysIn(period)).padStart(2, "0")}`;

/** What's left to pay after deductions and advances; advances never take pay below nothing. */
export function settle(grossKobo: number, a: Adjustment, due: { advanceId: string; amountKobo: number }[]) {
  let room = Math.max(0, grossKobo + a.bonusKobo - a.deductionKobo);
  const advances: { advanceId: string; amountKobo: number }[] = [];
  for (const d of due) {
    const take = Math.min(room, d.amountKobo);
    if (take > 0) advances.push({ advanceId: d.advanceId, amountKobo: take });
    room -= take;
  }
  return { advances, advanceKobo: advances.reduce((n, d) => n + d.amountKobo, 0), netKobo: room };
}

export function validateAdjustment(v: Partial<Record<keyof Adjustment, unknown>>) {
  const errors: Partial<Record<keyof Adjustment, string>> = {};
  for (const f of ["bonusKobo", "deductionKobo"] as const) {
    const n = v[f];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100_000_000_00)
      errors[f] = "Enter an amount, or leave it empty.";
  }
  if (typeof v.deductionNote !== "string" || v.deductionNote.length > 120)
    errors.deductionNote = "Keep it under 120 characters.";
  else if (typeof v.deductionKobo === "number" && v.deductionKobo > 0 && !v.deductionNote.trim())
    errors.deductionNote = "Say what it's for, so it shows on the payslip.";
  if (typeof v.excluded !== "boolean") errors.excluded = "Choose whether they're paid this month.";
  return errors;
}

type Summed = Pick<PayLine, "grossKobo" | "bonusKobo" | "deductionKobo" | "advanceKobo" | "netKobo" | "excluded">;
export const totals = (lines: Summed[]) => {
  const paid = lines.filter((l) => !l.excluded);
  const sum = (f: Exclude<keyof Summed, "excluded">) => paid.reduce((n, l) => n + l[f], 0);
  return {
    grossKobo: sum("grossKobo"),
    bonusKobo: sum("bonusKobo"),
    deductionKobo: sum("deductionKobo"),
    advanceKobo: sum("advanceKobo"),
    netKobo: sum("netKobo"),
    people: paid.filter((l) => l.netKobo > 0).length,
  };
};
