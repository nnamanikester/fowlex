import "server-only";

import type { PaystackResponse } from "./client";

/**
 * A stand-in for Paystack's API, for development and the e2e suite (PAYSTACK_SIMULATE=1, never in
 * production). It answers the calls Fowlex makes the way Paystack does, with a few account numbers
 * that behave badly on purpose:
 *
 * - 0000000000: no such account.
 * - 1111111111: the bank lookup is down (Paystack trouble).
 * - any number ending 0002: the transfer fails at the bank.
 *
 * Transfers settle at once (success or failure), and the balance starts at ₦10,000,000.
 */
export const SIMULATED_BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "023", name: "Citibank Nigeria" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "214", name: "First City Monument Bank" },
  { code: "058", name: "Guaranty Trust Bank" },
  { code: "50211", name: "Kuda Bank" },
  { code: "50515", name: "Moniepoint MFB" },
  { code: "999992", name: "OPay Digital Services Limited (OPay)" },
  { code: "999991", name: "PalmPay" },
  { code: "076", name: "Polaris Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "232", name: "Sterling Bank" },
  { code: "032", name: "Union Bank of Nigeria" },
  { code: "033", name: "United Bank For Africa" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
];
const NAMES = ["ADEBAYO OGUNLESI", "CHIOMA EZE", "MUSA BELLO", "NGOZI OKAFOR", "TUNDE BAKARE", "AMINA YUSUF"];

type Transfer = {
  reference: string;
  transfer_code: string;
  amount: number;
  recipient: string;
  reason: string;
  status: "otp" | "pending" | "success" | "failed" | "reversed";
  fee: number;
};
type State = { balance: number; recipients: Map<string, string>; transfers: Map<string, Transfer>; otp: boolean };
const g = globalThis as typeof globalThis & { __fowlexPaystack?: State };
const state = () =>
  (g.__fowlexPaystack ??= { balance: 1_000_000_000, recipients: new Map(), transfers: new Map(), otp: false });

/** Changes the balance or OTP setting, keeping recipients and transfers (as Paystack would). */
export function configureSimulator({ otp, balance }: { otp?: boolean; balance?: number }) {
  const s = state();
  if (otp !== undefined) s.otp = otp;
  if (balance !== undefined) s.balance = balance;
}

/** Resets the simulator; `otp` makes transfers wait for an OTP (Paystack's default). */
export function resetSimulator({ otp = false, balance = 1_000_000_000 }: { otp?: boolean; balance?: number } = {}) {
  g.__fowlexPaystack = { balance, recipients: new Map(), transfers: new Map(), otp };
}

const ok = <T>(data: T, message = "Success"): PaystackResponse<T> => ({ httpStatus: 200, status: true, message, data });
const no = <T>(httpStatus: number, message: string): PaystackResponse<T> => ({
  httpStatus,
  status: false,
  message,
  data: null,
});
// Paystack charges ₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above.
const fee = (amount: number) => (amount <= 500_000 ? 1_000 : amount <= 5_000_000 ? 2_500 : 5_000);

function settle(t: Transfer) {
  const account = state().recipients.get(t.recipient) ?? "";
  if (account.endsWith("0002")) {
    t.status = "failed";
    state().balance += t.amount + t.fee;
  } else t.status = "success";
}

export function simulate<T>(
  method: string,
  path: string,
  query: Record<string, string>,
  body: unknown,
): PaystackResponse<T> {
  const s = state();
  const b = (body ?? {}) as Record<string, unknown>;
  const answer = (() => {
    if (method === "GET" && path === "/bank") return ok(SIMULATED_BANKS.map((x) => ({ ...x, active: true })));
    if (method === "GET" && path === "/bank/resolve") {
      const number = query.account_number ?? "";
      if (!SIMULATED_BANKS.some((x) => x.code === query.bank_code)) return no(422, "Unknown bank code");
      if (number === "1111111111") return no(500, "An error occurred");
      if (number === "0000000000" || !/^\d{10}$/.test(number)) return no(422, "Could not resolve account name");
      return ok({ account_number: number, account_name: NAMES[Number(number.at(-1)) % NAMES.length] });
    }
    if (method === "POST" && path === "/transferrecipient") {
      const code = `RCP_sim${String(b.bank_code)}${String(b.account_number)}`;
      s.recipients.set(code, String(b.account_number));
      return ok({ recipient_code: code, active: true });
    }
    if (method === "GET" && path === "/balance") return ok([{ currency: "NGN", balance: s.balance }]);
    if (method === "POST" && path === "/transfer") {
      const reference = String(b.reference ?? "");
      if (s.transfers.has(reference)) return no(400, "Transfer reference already exists");
      const amount = Number(b.amount);
      if (!s.recipients.has(String(b.recipient))) return no(400, "Recipient specified is invalid");
      if (amount + fee(amount) > s.balance) return no(400, "Your balance is not enough to fulfil this request");
      s.balance -= amount + fee(amount);
      const t: Transfer = {
        reference,
        transfer_code: `TRF_sim${s.transfers.size + 1}`,
        amount,
        recipient: String(b.recipient),
        reason: String(b.reason ?? ""),
        status: s.otp ? "otp" : "pending",
        fee: fee(amount),
      };
      s.transfers.set(reference, t);
      if (!s.otp) settle(t);
      return ok(
        { ...t, status: s.otp ? "otp" : "pending" },
        s.otp ? "Transfer requires OTP to continue" : "Transfer has been queued",
      );
    }
    if (method === "POST" && path === "/transfer/finalize_transfer") {
      const t = [...s.transfers.values()].find((x) => x.transfer_code === b.transfer_code);
      if (!t || t.status !== "otp") return no(400, "Transfer is not currently awaiting OTP");
      if (b.otp !== "123456") return no(400, "Invalid OTP");
      settle(t);
      return ok({ ...t, status: "pending" }, "Transfer has been queued");
    }
    const verify = /^\/transfer\/verify\/(.+)$/.exec(path);
    if (method === "GET" && verify) {
      const t = s.transfers.get(decodeURIComponent(verify[1]));
      return t ? ok({ ...t, fee_charged: t.status === "success" ? t.fee : 0 }) : no(404, "Transfer not found");
    }
    return no(404, `The simulator doesn't know ${method} ${path}`);
  })();
  return answer as PaystackResponse<T>;
}
