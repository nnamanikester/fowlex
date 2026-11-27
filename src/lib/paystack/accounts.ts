import "server-only";

import { createRecipient, resolveAccount } from "./banks";
import { HttpError } from "@/lib/auth/guard";

export type SavedAccount = {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  recipientCode: string | null;
  verifiedAt: Date;
};

/**
 * A bank account to keep on a supplier or employee: checked with the bank (the name is the bank's,
 * whatever the form said), with a Paystack recipient to pay it. An unchanged account is kept as it
 * was. If Paystack can't make the recipient right now, the account is kept and the recipient is
 * made when first paid.
 */
export async function checkedBank(
  bank: { bankCode: string; accountNumber: string } | null,
  before?: SavedAccount | null,
): Promise<SavedAccount | null> {
  if (!bank) return null;
  if (before && before.bankCode === bank.bankCode && before.accountNumber === bank.accountNumber) return before;
  const account = await resolveAccount(bank.accountNumber, bank.bankCode).catch((error: HttpError) => {
    throw error.status === 503
      ? new HttpError(
          503,
          error.code,
          "We couldn't check the bank account just now. Try saving again in a moment.",
          "bank",
        )
      : new HttpError(400, error.code, error.message, "bank");
  });
  const recipientCode = await createRecipient(account).catch((error: HttpError) => {
    if (error.status === 503) return null;
    throw new HttpError(400, error.code, error.message, "bank");
  });
  return { ...account, recipientCode, verifiedAt: new Date() };
}
