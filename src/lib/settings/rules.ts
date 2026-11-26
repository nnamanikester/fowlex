/**
 * What settings may hold, shared by the form (Yup mirrors it) and the server. Money is in kobo.
 */
export const PREFIX = /^[A-Z0-9]{1,6}$/;
export const ACCOUNT_NUMBER = /^\d{10}$/; // A NUBAN.

/** "INV-2026-0007": prefix, the Lagos year, the number padded to four digits. */
export function formatInvoiceNumber(prefix: string, year: string | number, n: number) {
  return `${prefix}-${year}-${String(n).padStart(4, "0")}`;
}

export type SettingsInput = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  paymentTermsDays: number;
  vatEnabled: boolean;
  vatRateBps: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  expenseApprovalLimitKobo: number;
  defaultPricePerKgKobo: number | null;
};

const int = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v);

/** Checks a full settings form. Returns field → message for anything wrong; empty when fine. */
export function validateSettings(input: Partial<Record<keyof SettingsInput, unknown>>) {
  const errors: Partial<Record<keyof SettingsInput, string>> = {};
  const text = (key: keyof SettingsInput, max: number, required = false) => {
    const v = input[key];
    if (typeof v !== "string") errors[key] = "Enter text.";
    else if (required && !v.trim()) errors[key] = "This can't be empty.";
    else if (v.length > max) errors[key] = `Use at most ${max} characters.`;
  };
  text("businessName", 120, true);
  text("address", 300);
  text("phone", 30);
  text("email", 200);
  text("bankName", 80);
  text("accountName", 120);

  if (typeof input.email === "string" && input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    errors.email = "Enter a valid email.";
  if (typeof input.invoicePrefix !== "string" || !PREFIX.test(input.invoicePrefix))
    errors.invoicePrefix = "Use 1 to 6 capital letters or digits, like INV.";
  if (!int(input.nextInvoiceNumber) || (input.nextInvoiceNumber as number) < 1)
    errors.nextInvoiceNumber = "Use a whole number from 1.";
  if (
    !int(input.paymentTermsDays) ||
    (input.paymentTermsDays as number) < 0 ||
    (input.paymentTermsDays as number) > 365
  )
    errors.paymentTermsDays = "Use 0 to 365 days.";
  if (typeof input.vatEnabled !== "boolean") errors.vatEnabled = "Choose on or off.";
  if (!int(input.vatRateBps) || (input.vatRateBps as number) < 0 || (input.vatRateBps as number) > 10_000)
    errors.vatRateBps = "Use 0% to 100%.";
  if (typeof input.accountNumber !== "string" || (input.accountNumber && !ACCOUNT_NUMBER.test(input.accountNumber)))
    errors.accountNumber = "Use the 10-digit account number.";
  if (!int(input.expenseApprovalLimitKobo) || (input.expenseApprovalLimitKobo as number) < 0)
    errors.expenseApprovalLimitKobo = "Enter an amount.";
  if (
    input.defaultPricePerKgKobo !== null &&
    (!int(input.defaultPricePerKgKobo) || (input.defaultPricePerKgKobo as number) < 0)
  )
    errors.defaultPricePerKgKobo = "Enter an amount, or leave it empty.";
  return errors;
}
