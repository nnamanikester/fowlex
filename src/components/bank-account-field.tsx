"use client";

import * as React from "react";
import { CircleAlert, CircleCheck, LoaderCircle, RotateCw } from "lucide-react";

import { Field } from "@/components/auth";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { type BankAccount, isPopular, sortBanks } from "@/lib/suppliers/rules";

type Bank = { code: string; name: string };
let banksOnce: Promise<Bank[]> | null = null;
const loadBanks = () => {
  banksOnce ??= apiRequest<Bank[]>("/api/banks", "GET").catch((e) => {
    banksOnce = null;
    throw e;
  });
  return banksOnce;
};

export type BankState = "empty" | "partial" | "checking" | "found" | "not-found" | "unavailable";

/**
 * A bank account checked with the bank: choose the bank, type the 10-digit number, and the name on
 * the account appears to confirm. `onChange` gets the account only once the bank has named it, and
 * null otherwise; `onState` says where the check is, so a form can wait for it.
 */
export function BankAccountField({
  value,
  onChange,
  onState,
  error,
}: {
  value: BankAccount | null;
  onChange: (account: BankAccount | null) => void;
  onState?: (state: BankState) => void;
  error?: string;
}) {
  const [banks, setBanks] = React.useState<Bank[]>([]);
  const [banksError, setBanksError] = React.useState<string | null>(null);
  const [banksAttempt, setBanksAttempt] = React.useState(0);
  const [bankCode, setBankCode] = React.useState(value?.bankCode ?? "");
  const [number, setNumber] = React.useState(value?.accountNumber ?? "");
  const [attempt, setAttempt] = React.useState(0);
  // The bank's answer for one bank, number and attempt; a newer edit makes it stale.
  const [answer, setAnswer] = React.useState<{
    key: string;
    state: BankState;
    account?: BankAccount;
    message?: string;
  }>();
  const key = `${bankCode}:${number}:${attempt}`;
  const saved = value && value.bankCode === bankCode && value.accountNumber === number ? value : null;
  const needsCheck = !!bankCode && number.length === 10 && !saved;

  const state: BankState =
    !bankCode && !number
      ? "empty"
      : !bankCode || number.length !== 10
        ? "partial"
        : saved
          ? "found"
          : answer?.key === key
            ? answer.state
            : "checking";
  const account = saved ?? (answer?.key === key ? (answer.account ?? null) : null);
  const name = account?.accountName ?? "";
  const message = answer?.key === key ? (answer.message ?? "") : "";

  const changed = React.useRef(onChange);
  const stated = React.useRef(onState);
  React.useEffect(() => {
    changed.current = onChange;
    stated.current = onState;
  });

  React.useEffect(() => {
    let live = true;
    loadBanks().then(
      (list) => {
        if (!live) return;
        setBanks(list);
        setBanksError(null);
      },
      (e: AuthError) => live && setBanksError(e.message),
    );
    return () => {
      live = false;
    };
  }, [banksAttempt]);

  // Tell the form where the check is, and the account once the bank has named it.
  React.useEffect(() => {
    stated.current?.(state);
    changed.current(state === "found" ? account : null);
  }, [state, account]);

  // On a phone the answer lands under the keyboard: bring it into view.
  const status = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (state === "found" || state === "not-found" || state === "unavailable")
      status.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [state]);

  // Check the account once the bank and all 10 digits are in; a newer edit cancels an older check.
  React.useEffect(() => {
    if (!needsCheck) return;
    let live = true;
    const timer = setTimeout(() => {
      apiRequest<BankAccount>(`/api/banks/resolve?accountNumber=${number}&bankCode=${bankCode}`, "GET").then(
        (found) => live && setAnswer({ key, state: "found", account: found }),
        (e: AuthError) =>
          live && setAnswer({ key, state: e.status === 400 ? "not-found" : "unavailable", message: e.message }),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [needsCheck, key, number, bankCode]);

  const sorted = sortBanks(banks);
  const popular = sorted.filter((b) => isPopular(b.name));
  const rest = sorted.filter((b) => !isPopular(b.name));

  return (
    <div className="space-y-3" data-field="bank">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="bankCode" label="Bank" error={banksError ?? undefined}>
          {(a11y) => (
            <Select {...a11y} value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
              <option value="">
                {banks.length ? "Choose the bank" : banksError ? "Banks didn't load" : "Loading banks…"}
              </option>
              {value && !banks.some((b) => b.code === value.bankCode) && (
                <option value={value.bankCode}>{value.bankName || value.bankCode}</option>
              )}
              {popular.length > 0 && (
                <optgroup label="Popular">
                  {popular.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All banks">
                {rest.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            </Select>
          )}
        </Field>
        <Field id="accountNumber" label="Account number" error={state === "not-found" ? message : error}>
          {(a11y) => (
            <Input
              {...a11y}
              inputMode="numeric"
              autoComplete="off"
              className="num tracking-wider"
              placeholder="0123456789"
              maxLength={10}
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          )}
        </Field>
      </div>
      <div ref={status} aria-live="polite" className="scroll-mb-28">
        {banksError && !banks.length && (
          <button
            type="button"
            onClick={() => setBanksAttempt((a) => a + 1)}
            className="focus-ring mb-2 inline-flex items-center gap-1 rounded-md text-sm font-semibold text-brand-fg"
          >
            <RotateCw className="size-3.5" aria-hidden /> Load the banks again
          </button>
        )}
        {state === "checking" && (
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Checking with the bank…
          </p>
        )}
        {state === "found" && (
          <p className="flex items-start gap-2 rounded-xl border border-success-line bg-success-subtle px-3 py-2.5 text-sm">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden />
            <span>
              <span className="block font-semibold text-fg">{name || value?.accountName}</span>
              <span className="text-fg-muted">
                The bank&apos;s name for this account. Check it&apos;s who you mean to pay.
              </span>
            </span>
          </p>
        )}
        {state === "unavailable" && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-warning-fg">
            <CircleAlert className="size-4" aria-hidden /> {message}
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="focus-ring inline-flex items-center gap-1 rounded-md font-semibold text-brand-fg"
            >
              <RotateCw className="size-3.5" aria-hidden /> Retry
            </button>
          </p>
        )}
        {state === "partial" && number.length > 0 && number.length < 10 && (
          <p className="text-sm text-fg-muted">{10 - number.length} more digits</p>
        )}
      </div>
    </div>
  );
}
