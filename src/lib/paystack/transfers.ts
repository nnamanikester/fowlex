import "server-only";

import { isProviderTrouble, paystack, unavailable } from "./client";

/** Naira the Paystack balance holds, in kobo. */
export async function getBalance() {
  const res = await paystack<{ currency: string; balance: number }[]>("/balance");
  if (!res.status || !Array.isArray(res.data)) throw unavailable();
  return res.data.find((b) => b.currency === "NGN")?.balance ?? 0;
}

export type TransferData = { transfer_code?: string; status?: string; reference?: string; fee_charged?: number };

/** Asks Paystack to send money from the balance. Resolves with Paystack's whole answer. */
export const initiateTransfer = (t: { amountKobo: number; recipient: string; reference: string; reason: string }) =>
  paystack<TransferData>("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: t.amountKobo,
      recipient: t.recipient,
      reference: t.reference,
      reason: t.reason,
      currency: "NGN",
    },
  });

/** Completes a transfer Paystack held for an OTP. */
export const finalizeTransfer = (transferCode: string, otp: string) =>
  paystack<TransferData>("/transfer/finalize_transfer", { method: "POST", body: { transfer_code: transferCode, otp } });

/**
 * Where a transfer stands at Paystack: its status and fee, null if Paystack has no such transfer.
 * Rejects (503) when Paystack can't say.
 */
export async function verifyTransfer(reference: string) {
  const res = await paystack<TransferData>(`/transfer/verify/${encodeURIComponent(reference)}`);
  if (res.httpStatus === 404) return null;
  if (!res.status || !res.data || isProviderTrouble(res)) throw unavailable();
  const fee = Number(res.data.fee_charged ?? 0);
  return {
    status: String(res.data.status ?? ""),
    transferCode: res.data.transfer_code ?? null,
    feeKobo: Number.isFinite(fee) && fee > 0 ? Math.round(fee) : 0,
  };
}
