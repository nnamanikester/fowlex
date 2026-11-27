import "server-only";

import { HttpError } from "@/lib/auth/guard";
import { paystack, paystackTrouble } from "./client";

export type TransferAccount = {
  reference: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  expiresAt: Date;
};

/**
 * Asks Paystack for a one-off bank account to pay `amountKobo` into ("Pay with Transfer"). It
 * works until `expiresAt` (Paystack allows 15 minutes to 8 hours); the money landing is reported
 * by webhook (charge.success) and can be checked with `verifyCharge`.
 */
export async function startTransferCharge(input: {
  email: string;
  amountKobo: number;
  reference: string;
  expiresAt: Date;
  metadata: Record<string, string>;
}): Promise<TransferAccount> {
  const res = await paystack<{
    reference?: string;
    account_number?: string;
    account_name?: string;
    bank?: { name?: string };
    account_expires_at?: string;
  }>("/charge", {
    method: "POST",
    body: {
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      bank_transfer: { account_expires_at: input.expiresAt.toISOString() },
      metadata: input.metadata,
    },
  });
  const d = res.data;
  if (!res.status || !d?.account_number) {
    if (res.httpStatus === 400 && res.message && !/key|ip|whitelist/i.test(res.message))
      throw new HttpError(400, "transfer_refused", `Paystack couldn't make an account: ${res.message}`);
    throw paystackTrouble(res, "making a transfer account");
  }
  return {
    reference: d.reference ?? input.reference,
    accountNumber: d.account_number,
    accountName: d.account_name ?? "",
    bankName: d.bank?.name ?? "",
    expiresAt: d.account_expires_at ? new Date(d.account_expires_at) : input.expiresAt,
  };
}

/** Where a charge stands at Paystack: "success" once the money is in, with the amount and when. */
export async function verifyCharge(reference: string) {
  const res = await paystack<{ status?: string; amount?: number; paid_at?: string | null }>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  if (res.httpStatus === 404) return null;
  if (!res.status || !res.data) throw paystackTrouble(res, "checking a payment");
  return {
    status: String(res.data.status ?? ""),
    amountKobo: Number(res.data.amount ?? 0),
    paidAt: res.data.paid_at ? new Date(res.data.paid_at) : null,
  };
}
