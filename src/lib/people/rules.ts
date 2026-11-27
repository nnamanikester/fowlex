// Safe for the browser: no model or database imports here.
import { normalisePhone } from "@/lib/suppliers/rules";

/** How someone is paid: a monthly salary, by the day they work, or per batch they look after. */
export const PAY_TYPES = ["monthly", "daily", "per-batch"] as const;
export type PayType = (typeof PAY_TYPES)[number];
export const PAY_TYPE_LABELS: Record<PayType, string> = {
  monthly: "Monthly salary",
  daily: "Paid by the day",
  "per-batch": "Paid per batch",
};
/** "₦60,000 a month", from the rate already formatted. */
export const PER: Record<PayType, string> = { monthly: "a month", daily: "a day", "per-batch": "a batch" };

export type EmployeeInput = {
  name: string;
  job: string;
  phone: string;
  email: string;
  address: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  startDate: string;
  payType: PayType;
  /** Their pay for a month, a day or a batch, in kobo. */
  rateKobo: number;
  /** Batches a per-batch worker looks after. */
  batchIds: string[];
  notes: string;
  bank: { bankCode: string; bankName?: string; accountNumber: string; accountName?: string } | null;
};

export const LIMITS = { text: 120, address: 300, notes: 500, kobo: 100_000_000_00 };

export const tidyName = (name: string) => name.trim().replace(/\s+/g, " ");

export function validateEmployee(v: Partial<Record<keyof EmployeeInput, unknown>>, { today }: { today: string }) {
  const errors: Partial<Record<keyof EmployeeInput, string>> = {};
  const name = typeof v.name === "string" ? tidyName(v.name) : "";
  if (!name) errors.name = "Enter their name.";
  else if (name.length > LIMITS.text) errors.name = `Use at most ${LIMITS.text} characters.`;
  for (const f of ["job", "nextOfKinName"] as const)
    if (typeof v[f] !== "string" || (v[f] as string).length > LIMITS.text)
      errors[f] = `Use at most ${LIMITS.text} characters.`;
  for (const f of ["phone", "nextOfKinPhone"] as const) {
    const value = v[f];
    if (typeof value !== "string") errors[f] = "Enter a phone number.";
    else if (value && !normalisePhone(value)) errors[f] = "Enter a Nigerian number, like 0803 123 4567.";
  }
  if (typeof v.email !== "string") errors.email = "Enter an email, or leave it empty.";
  else if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.email = "Enter a valid email.";
  if (typeof v.address !== "string" || v.address.length > LIMITS.address) errors.address = "Keep it shorter.";
  if (typeof v.notes !== "string" || v.notes.length > LIMITS.notes)
    errors.notes = `Keep it under ${LIMITS.notes} characters.`;
  if (typeof v.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.startDate))
    errors.startDate = "Choose when they started.";
  else if (v.startDate > today) errors.startDate = "That's in the future.";
  if (!PAY_TYPES.includes(v.payType as PayType)) errors.payType = "Choose how they're paid.";
  const rate = v.rateKobo;
  if (typeof rate !== "number" || !Number.isInteger(rate) || rate < 1 || rate > LIMITS.kobo)
    errors.rateKobo = "Enter their pay.";
  if (!Array.isArray(v.batchIds) || v.batchIds.some((id) => typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)))
    errors.batchIds = "Choose the batches again.";
  const bank = v.bank as EmployeeInput["bank"] | undefined;
  if (
    bank !== null &&
    bank !== undefined &&
    (typeof bank !== "object" || !bank.bankCode || !/^\d{10}$/.test(String(bank.accountNumber)))
  )
    errors.bank = "Check the bank account.";
  return errors;
}
