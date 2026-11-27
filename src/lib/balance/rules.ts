/**
 * The Paystack balance's own book: every naira in or out of it, whatever caused it. Nothing here is
 * revenue or profit; it's what the balance holds, kept so Fowlex's figure matches Paystack's.
 */
export const DIRECTIONS = ["credit", "debit"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const ENTRY_CATEGORIES = [
  "opening",
  "funding",
  "transfer",
  "transfer_fee",
  "transfer_reversal",
  "collection",
  "collection_fee",
  "refund",
  "service_charge",
  "other",
] as const;
export type EntryCategory = (typeof ENTRY_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<EntryCategory, string> = {
  opening: "Opening balance",
  funding: "Funding",
  transfer: "Transfer",
  transfer_fee: "Transfer fee",
  transfer_reversal: "Transfer returned",
  collection: "Payment received",
  collection_fee: "Payment fee",
  refund: "Refund",
  service_charge: "Paystack charge",
  other: "Other",
};

/** How a movement came about. */
export const CHANNELS = ["fowlex", "paystack", "bank-transfer", "simulator"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = {
  fowlex: "From Fowlex",
  paystack: "Made in Paystack",
  "bank-transfer": "Bank transfer in",
  simulator: "Test money",
};

/** Pending: Fowlex started it and Paystack's ledger hasn't shown it yet. Confirmed: Paystack's ledger has it. */
export const ENTRY_STATUSES = ["pending", "confirmed"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** Positive for money in, negative for money out. */
export const signed = (e: { direction: Direction; amountKobo: number }) =>
  e.direction === "credit" ? e.amountKobo : -e.amountKobo;

/** The top-up account the Paystack Dashboard shows: what Fowlex shows for funding the balance. */
export type TopUpAccount = { bankName: string; accountNumber: string; accountName: string };

export function validateTopUp(v: Partial<TopUpAccount>): Partial<Record<keyof TopUpAccount, string>> {
  const errors: Partial<Record<keyof TopUpAccount, string>> = {};
  if (!v.bankName?.trim()) errors.bankName = "Enter the bank, as Paystack shows it.";
  if (!/^\d{10}$/.test((v.accountNumber ?? "").replace(/\s/g, "")))
    errors.accountNumber = "Enter the 10-digit account number.";
  if (!v.accountName?.trim()) errors.accountName = "Enter the account name, as Paystack shows it.";
  return errors;
}
