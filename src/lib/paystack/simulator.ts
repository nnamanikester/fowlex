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
 * - at the test bank (001), any number is "TEST ACCOUNT", as with Paystack's test keys.
 *
 * Transfers settle at once (success or failure), and the balance starts at ₦10,000,000. Every
 * change to the balance is written to its ledger, as Paystack's /balance/ledger lists them.
 */
export const SIMULATED_BANKS = [
  { code: "001", name: "Test Bank" },
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
  id: number;
  reference: string;
  transfer_code: string;
  amount: number;
  recipient: string;
  reason: string;
  status: "otp" | "pending" | "success" | "failed" | "reversed";
  fee: number;
};
/** A row of Paystack's balance ledger, as the API sends it. */
export type LedgerRow = {
  id: number;
  balance: number;
  currency: string;
  difference: number;
  reason: string;
  model_responsible: string;
  model_row: number;
  createdAt: string;
};
/** A one-off transfer account for a payment, and whether the money has come in. */
type Charge = { reference: string; amount: number; email: string; paid: boolean; expiresAt: string };
type State = {
  charges: Map<string, Charge>;
  balance: number;
  recipients: Map<string, string>;
  transfers: Map<string, Transfer>;
  otp: boolean;
  ledger: LedgerRow[];
};
const g = globalThis as typeof globalThis & { __fowlexPaystack?: State };
const fresh = (balance: number, otp: boolean): State => ({
  charges: new Map(),
  balance,
  recipients: new Map(),
  transfers: new Map(),
  otp,
  ledger: [],
});
const state = () => (g.__fowlexPaystack ??= fresh(1_000_000_000, false));

/** Moves the balance and writes the ledger row, as Paystack does for every change. */
function move(difference: number, reason: string, model: string, row: number) {
  const s = state();
  s.balance += difference;
  s.ledger.push({
    id: s.ledger.length + 1,
    balance: s.balance,
    currency: "NGN",
    difference,
    reason,
    model_responsible: model,
    model_row: row,
    // A millisecond apart at least, so "after the last one read" never skips a row.
    createdAt: new Date(Math.max(Date.now(), Date.parse(s.ledger.at(-1)?.createdAt ?? "0") + 1)).toISOString(),
  });
}

/** Any other change to the balance, as Paystack would list it (tests: charges, refunds, payments). */
export function simulateLedger(difference: number, reason: string, model: string) {
  move(difference, reason, model, state().ledger.length + 1);
}

/** The customer pays into a one-off transfer account (in the simulator, at once). */
export function payCharge(reference: string) {
  const c = state().charges.get(reference);
  if (!c) return false;
  c.paid = true;
  return true;
}

/** Test money into the balance, as a top-up to the account the Paystack Dashboard shows. */
export function topUpSimulator(amountKobo: number) {
  move(amountKobo, "Balance top-up", "Topup", state().ledger.length + 1);
}

/** Changes the balance or OTP setting, keeping recipients and transfers (as Paystack would). */
export function configureSimulator({ otp, balance }: { otp?: boolean; balance?: number }) {
  const s = state();
  if (otp !== undefined) s.otp = otp;
  if (balance !== undefined) s.balance = balance;
}

/** Resets the simulator; `otp` makes transfers wait for an OTP (Paystack's default). */
export function resetSimulator({ otp = false, balance = 1_000_000_000 }: { otp?: boolean; balance?: number } = {}) {
  g.__fowlexPaystack = fresh(balance, otp);
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

/** The money leaves when Paystack takes the transfer (after the OTP, if it asked for one). */
function debit(t: Transfer) {
  move(-t.amount, t.reason, "Transfer", t.id);
  move(-t.fee, "Transfer charge", "Transfer", t.id);
}

function settle(t: Transfer) {
  const account = state().recipients.get(t.recipient) ?? "";
  if (account.endsWith("0002")) {
    t.status = "failed";
    move(t.amount + t.fee, "Transfer reversal", "Transfer", t.id);
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
      if (query.bank_code === "001" && /^\d{10}$/.test(number))
        return ok({ account_number: number, account_name: "TEST ACCOUNT" });
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
      const t: Transfer = {
        id: s.transfers.size + 1,
        reference,
        transfer_code: `TRF_sim${s.transfers.size + 1}`,
        amount,
        recipient: String(b.recipient),
        reason: String(b.reason ?? ""),
        status: s.otp ? "otp" : "pending",
        fee: fee(amount),
      };
      s.transfers.set(reference, t);
      if (!s.otp) {
        debit(t);
        settle(t);
      }
      return ok(
        { ...t, status: s.otp ? "otp" : "pending" },
        s.otp ? "Transfer requires OTP to continue" : "Transfer has been queued",
      );
    }
    if (method === "POST" && path === "/transfer/finalize_transfer") {
      const t = [...s.transfers.values()].find((x) => x.transfer_code === b.transfer_code);
      if (!t || t.status !== "otp") return no(400, "Transfer is not currently awaiting OTP");
      if (b.otp !== "123456") return no(400, "Invalid OTP");
      debit(t);
      settle(t);
      return ok({ ...t, status: "pending" }, "Transfer has been queued");
    }
    if (method === "POST" && path === "/charge") {
      const reference = String(b.reference ?? "");
      const amount = Number(b.amount);
      if (!reference || !(amount > 0) || !b.email) return no(400, "Invalid charge");
      if (s.charges.has(reference)) return no(400, "Duplicate Transaction Reference");
      const expiresAt = String(
        (b.bank_transfer as { account_expires_at?: string } | undefined)?.account_expires_at ?? "",
      );
      s.charges.set(reference, { reference, amount, email: String(b.email), paid: false, expiresAt });
      return ok(
        {
          status: "pending_bank_transfer",
          display_text: "Please make a transfer to the account specified",
          reference,
          amount,
          account_name: "PAYSTACK-TITAN FOWLEX",
          account_number: `99${String(s.charges.size).padStart(8, "0")}`,
          bank: { slug: "paystack-titan", name: "Paystack-Titan", id: 171 },
          account_expires_at: expiresAt,
        },
        "Charge attempted",
      );
    }
    const charge = /^\/transaction\/verify\/(.+)$/.exec(path);
    if (method === "GET" && charge) {
      const c = s.charges.get(decodeURIComponent(charge[1]));
      if (!c) return no(404, "Transaction reference not found");
      return ok({
        status: c.paid ? "success" : "ongoing",
        amount: c.amount,
        paid_at: c.paid ? new Date().toISOString() : null,
        reference: c.reference,
      });
    }
    if (method === "GET" && path === "/balance/ledger") {
      // Newest first, like Paystack; `from` keeps rows at or after it.
      const from = query.from ? Date.parse(query.from) : 0;
      const perPage = Number(query.perPage ?? 50);
      const page = Number(query.page ?? 1);
      const rows = s.ledger.filter((r) => Date.parse(r.createdAt) >= from).reverse();
      return {
        ...ok(rows.slice((page - 1) * perPage, page * perPage), "Balance ledger retrieved"),
        meta: { total: rows.length, page, perPage, pageCount: Math.ceil(rows.length / perPage) },
      };
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
