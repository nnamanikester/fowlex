import "server-only";

import { isProviderTrouble, paystack, paystackTrouble } from "./client";

/** Naira the Paystack balance holds, in kobo. */
export async function getBalance() {
  const res = await paystack<{ currency: string; balance: number }[]>("/balance");
  if (!res.status || !Array.isArray(res.data)) throw paystackTrouble(res, "reading the balance");
  return res.data.find((b) => b.currency === "NGN")?.balance ?? 0;
}

export type TransferData = {
  id?: number | string;
  transfer_code?: string;
  status?: string;
  reference?: string;
  fee_charged?: number;
};

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
  if (!res.status || !res.data || isProviderTrouble(res)) throw paystackTrouble(res, "checking a transfer");
  const fee = Number(res.data.fee_charged ?? 0);
  return {
    status: String(res.data.status ?? ""),
    transferCode: res.data.transfer_code ?? null,
    transferId: res.data.id === undefined || res.data.id === null ? null : String(res.data.id),
    feeKobo: Number.isFinite(fee) && fee > 0 ? Math.round(fee) : 0,
  };
}

/** A row of Paystack's balance ledger: one change to the balance, with the balance after it. */
export type LedgerRow = {
  id: string;
  balanceKobo: number;
  differenceKobo: number;
  reason: string;
  model: string;
  modelRow: string | null;
  at: Date;
  raw: Record<string, unknown>;
};

const PAGES = 20;

/**
 * Every balance ledger row from `from` on, oldest first. Paystack lists newest first, a page at a
 * time; reading stops after 20 pages (2,000 rows), and the next sync carries on from the newest.
 */
export async function readLedger(from: Date | null): Promise<LedgerRow[]> {
  const rows: LedgerRow[] = [];
  for (let page = 1; page <= PAGES; page++) {
    const res = await paystack<Record<string, unknown>[]>("/balance/ledger", {
      query: { perPage: "100", page: String(page), ...(from && { from: from.toISOString() }) },
    });
    if (!res.status || !Array.isArray(res.data)) throw paystackTrouble(res, "reading the balance ledger");
    for (const r of res.data) {
      const at = new Date(String(r.createdAt ?? r.created_at ?? ""));
      const difference = Number(r.difference);
      if (r.id === undefined || !Number.isFinite(difference) || Number.isNaN(at.getTime())) continue;
      rows.push({
        id: String(r.id),
        balanceKobo: Number(r.balance),
        differenceKobo: Math.round(difference),
        reason: String(r.reason ?? ""),
        model: String(r.model_responsible ?? ""),
        modelRow: r.model_row === undefined || r.model_row === null ? null : String(r.model_row),
        at,
        raw: r,
      });
    }
    const pageCount = res.meta?.pageCount;
    if (!res.data.length || (pageCount !== undefined && page >= pageCount) || res.data.length < 100) break;
  }
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime() || Number(a.id) - Number(b.id));
}
