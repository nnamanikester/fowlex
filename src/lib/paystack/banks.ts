import "server-only";

import { HttpError } from "@/lib/auth/guard";
import { TEST_BANK } from "@/lib/suppliers/rules";
import { isProviderTrouble, paystack, type PaystackResponse, paystackMode, paystackTrouble } from "./client";

/** `test`: Paystack's test bank, only offered with test keys (and in the simulator). */
export type Bank = { code: string; name: string; test?: true };

export { TEST_BANK } from "@/lib/suppliers/rules";

const DAY = 24 * 60 * 60 * 1000;
const g = globalThis as typeof globalThis & {
  __fowlexBanks?: { at: number; banks: Bank[] };
  __fowlexResolved?: Map<string, { at: number; ttl: number; outcome: Outcome }>;
};

/** Every Nigerian bank Paystack can pay, A to Z, cached for a day (it rarely changes). */
export async function listBanks(): Promise<Bank[]> {
  if (g.__fowlexBanks && Date.now() - g.__fowlexBanks.at < DAY) return withTestBank(g.__fowlexBanks.banks);
  const banks: Bank[] = [];
  let next: string | undefined;
  // Follow Paystack's cursor, bounded so a bad cursor can't loop forever.
  for (let page = 0; page < 10; page++) {
    const res = await paystack<{ code?: string; name?: string; active?: boolean }[]>("/bank", {
      query: { country: "nigeria", perPage: "100", use_cursor: "true", ...(next && { next }) },
    });
    if (!res.status || !Array.isArray(res.data)) throw paystackTrouble(res, "listing banks");
    for (const b of res.data) if (b.code && b.name && b.active !== false) banks.push({ code: b.code, name: b.name });
    next = res.meta?.next ?? undefined;
    if (!next) break;
  }
  const unique = [...new Map(banks.map((b) => [b.code, b])).values()].sort((a, b) => a.name.localeCompare(b.name));
  g.__fowlexBanks = { at: Date.now(), banks: unique };
  return withTestBank(unique);
}

/** Outside live, the test bank comes first, so trying Fowlex never runs into Paystack's daily limit. */
function withTestBank(banks: Bank[]): Bank[] {
  if (paystackMode() === "live") return banks.filter((b) => b.code !== TEST_BANK.code);
  const rest = banks.filter((b) => b.code !== TEST_BANK.code);
  return [{ code: TEST_BANK.code, name: TEST_BANK.name, test: true }, ...rest];
}

type Outcome = { kind: "found"; accountName: string } | { kind: "not_found" } | { kind: "invalid_bank" };

/**
 * Turns a lookup answer into a verdict on the account, or null when it says nothing about the
 * account (Paystack trouble, rate limits). Null is never cached.
 */
export function classifyLookup(res: PaystackResponse<{ account_name?: string }>): Outcome | null {
  const ok = res.httpStatus >= 200 && res.httpStatus < 300;
  if (ok && res.status && res.data?.account_name) return { kind: "found", accountName: res.data.account_name.trim() };
  if (isProviderTrouble(res)) return null;
  const definite = [400, 404, 422].includes(res.httpStatus) || (ok && !res.status && !!res.message);
  if (!definite) return null;
  if (/bank/i.test(res.message) && /unknown|invalid|not found|not supported|code/i.test(res.message))
    return { kind: "invalid_bank" };
  return { kind: "not_found" };
}

export const RESOLVE_MESSAGES = {
  notFound: "We couldn't find that account. Check the number and the bank.",
  invalidBank: "Choose the bank again.",
  number: "Enter the 10-digit account number.",
};

/**
 * The name on a bank account, as the bank has it. Found accounts are remembered for a day, and a
 * "no such account" for 10 minutes (so a typo can be fixed and retried); Paystack trouble never is.
 */
export async function resolveAccount(accountNumber: unknown, bankCode: unknown) {
  const number = typeof accountNumber === "string" ? accountNumber.replace(/\D/g, "") : "";
  const code = typeof bankCode === "string" ? bankCode.trim() : "";
  if (!/^\d{10}$/.test(number)) throw new HttpError(400, "invalid_account", RESOLVE_MESSAGES.number, "accountNumber");
  if (!code) throw new HttpError(400, "invalid_bank", "Choose the bank.", "bankCode");

  const cache = (g.__fowlexResolved ??= new Map());
  const key = `${code}:${number}`;
  const hit = cache.get(key);
  let outcome = hit && Date.now() - hit.at < hit.ttl ? hit.outcome : null;
  if (!outcome) {
    const res = await paystack<{ account_name?: string }>("/bank/resolve", {
      query: { account_number: number, bank_code: code },
    });
    outcome = classifyLookup(res);
    if (!outcome) throw paystackTrouble(res, "checking a bank account");
    cache.set(key, { at: Date.now(), ttl: outcome.kind === "found" ? DAY : 10 * 60 * 1000, outcome });
  }
  if (outcome.kind === "not_found")
    throw new HttpError(400, "account_not_found", RESOLVE_MESSAGES.notFound, "accountNumber");
  if (outcome.kind === "invalid_bank")
    throw new HttpError(400, "invalid_bank", RESOLVE_MESSAGES.invalidBank, "bankCode");
  const bank = (await listBanks().catch(() => [])).find((b) => b.code === code);
  return { accountNumber: number, bankCode: code, bankName: bank?.name ?? "", accountName: outcome.accountName };
}

/** Forgets cached banks and lookups (tests). */
export function clearBankCache() {
  delete g.__fowlexBanks;
  g.__fowlexResolved?.clear();
}

/**
 * A Paystack transfer recipient for a bank account: the code transfers are sent to.
 */
export async function createRecipient(account: { accountName: string; accountNumber: string; bankCode: string }) {
  const res = await paystack<{ recipient_code?: string }>("/transferrecipient", {
    method: "POST",
    body: {
      type: "nuban",
      name: account.accountName,
      account_number: account.accountNumber,
      bank_code: account.bankCode,
      currency: "NGN",
    },
  });
  if (res.status && res.data?.recipient_code) return res.data.recipient_code;
  if (isProviderTrouble(res) || !res.httpStatus || res.httpStatus === 401 || res.httpStatus === 403)
    throw paystackTrouble(res, "making a transfer recipient");
  throw new HttpError(400, "recipient_refused", res.message || "Paystack won't pay this account.", "accountNumber");
}
