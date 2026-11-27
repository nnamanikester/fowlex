"use client";

import * as React from "react";

import { Field } from "@/components/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { formatNaira } from "@/lib/money";
import {
  type AdvanceInput,
  type AdvancePayment,
  instalment,
  monthName,
  nextPeriod,
  validateAdvance,
} from "@/lib/people/advance-rules";
import type { AdvanceView } from "@/lib/people/advances";
import type { EmployeeView } from "@/lib/people/service";

const SPREADS = [1, 2, 3, 6] as const;

/** Money given ahead of pay: how much, how it was handed over, and over how many months it comes back. */
export function AdvanceSheet({
  employee,
  today,
  onClose,
  onSaved,
}: {
  employee: EmployeeView;
  today: string;
  onClose: () => void;
  onSaved: (advance: AdvanceView) => void;
}) {
  const thisMonth = today.slice(0, 7);
  const [v, setV] = React.useState<AdvanceInput>({
    employeeId: employee.id,
    date: today,
    amountKobo: Number.NaN,
    months: 1,
    firstPeriod: thisMonth,
    reason: "",
  });
  const [paidBy, setPaidBy] = React.useState<AdvancePayment>("cash");
  const [submitted, setSubmitted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const errors = validateAdvance(v, { today });
  const show = (f: keyof AdvanceInput) => (failure?.field === f ? failure.message : submitted ? errors[f] : undefined);
  const set = <K extends keyof AdvanceInput>(k: K, value: AdvanceInput[K]) => setV((d) => ({ ...d, [k]: value }));
  const amount = Number.isFinite(v.amountKobo) ? v.amountKobo : 0;
  let last = v.firstPeriod;
  for (let i = 1; i < v.months; i++) last = nextPeriod(last);

  const save = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length) {
      document.getElementById(Object.keys(errors)[0])?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      onSaved(await apiRequest<AdvanceView>("/api/advances", "POST", { ...v, paidBy }));
    } catch (e) {
      setFailure(e as AuthError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title="Give an advance"
      subtitle={`To ${employee.name}, out of their pay`}
      footer={
        <div className="space-y-2">
          <ActionFeedback action={{ failure }} />
          <Button size="lg" fullWidth loading={busy} onClick={() => void save()}>
            {paidBy === "paystack" ? "Save and send it" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field id="amountKobo" label="How much" error={show("amountKobo")}>
          {(a11y) => (
            <MoneyInput
              {...a11y}
              value={amount || null}
              onChange={(k) => set("amountKobo", k ?? Number.NaN)}
              placeholder="20,000.00"
            />
          )}
        </Field>

        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-semibold text-fg">How did they get it?</legend>
          <Segmented
            label="Given by"
            className="w-full"
            value={paidBy}
            onChange={setPaidBy}
            options={[
              { value: "cash", label: "Cash" },
              { value: "transfer", label: "Transfer" },
              ...(employee.bank ? [{ value: "paystack" as const, label: "Paystack" }] : []),
            ]}
          />
          <p className="text-xs text-fg-muted">
            {paidBy === "paystack"
              ? `Sent to ${employee.bank!.bankName} ${employee.bank!.accountName} from Expenses, next.`
              : employee.bank
                ? "Already handed over."
                : `Already handed over. Add ${employee.name}'s bank account to send one through Paystack.`}
          </p>
        </fieldset>

        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-semibold text-fg">Paid back over</legend>
          <Segmented
            label="Paid back over"
            className="w-full"
            value={String(v.months)}
            onChange={(m: string) => set("months", Number(m))}
            options={SPREADS.map((m) => ({ value: String(m), label: m === 1 ? "1 month" : `${m} months` }))}
          />
          <Segmented
            label="Starting with"
            className="w-full"
            value={v.firstPeriod === thisMonth ? "this" : "next"}
            onChange={(p: string) => set("firstPeriod", p === "this" ? thisMonth : nextPeriod(thisMonth))}
            options={[
              { value: "this", label: `${monthName(thisMonth).split(" ")[0]}'s pay` },
              { value: "next", label: `${monthName(nextPeriod(thisMonth)).split(" ")[0]}'s pay` },
            ]}
          />
          {amount > 0 && (
            <p className="num rounded-lg bg-surface-subtle px-3 py-2 text-sm text-fg">
              {v.months === 1
                ? `All ${formatNaira(amount)} comes out of ${monthName(v.firstPeriod)}'s pay.`
                : `${formatNaira(instalment(amount, v.months))} comes out of each month's pay, ${monthName(v.firstPeriod)} to ${monthName(last)}.`}
            </p>
          )}
          {show("firstPeriod") && <p className="text-sm text-danger-fg">{show("firstPeriod")}</p>}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="date" label="Given on" error={show("date")}>
            {(a11y) => (
              <Input {...a11y} type="date" value={v.date} max={today} onChange={(e) => set("date", e.target.value)} />
            )}
          </Field>
          <Field id="reason" label="What for" error={show("reason")} hint="Optional">
            {(a11y) => (
              <Input
                {...a11y}
                value={v.reason}
                maxLength={200}
                placeholder="School fees"
                onChange={(e) => set("reason", e.target.value)}
              />
            )}
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
