"use client";

import * as React from "react";
import { HandCoins, LoaderCircle, Trash2 } from "lucide-react";

import { Field } from "@/components/auth";
import { ConfirmDialog } from "@/components/kit";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/auth/client";
import { formatRange } from "@/lib/dates";
import type { InvoiceView } from "@/lib/invoices/service";
import { formatNaira } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payments/rules";
import type { PaymentView } from "@/lib/payments/service";
import { useAction } from "@/lib/use-action";

const day = (d: string) => formatRange({ from: d, to: d });

/** The payments on an invoice, each removable if recorded by mistake. */
export function PaymentsList({
  invoice,
  canPay,
  onChanged,
}: {
  invoice: InvoiceView;
  canPay: boolean;
  onChanged: (message: string) => void;
}) {
  const [state, setState] = React.useState<{ list: PaymentView[] | null; error?: string; attempt: number }>({
    list: null,
    attempt: 0,
  });
  const [removing, setRemoving] = React.useState<PaymentView | null>(null);
  React.useEffect(() => {
    let live = true;
    apiRequest<PaymentView[]>(`/api/invoices/${invoice.id}/payments`, "GET").then(
      (list) => live && setState((s) => ({ ...s, list, error: undefined })),
      (e: { message: string }) => live && setState((s) => ({ ...s, list: [], error: e.message })),
    );
    return () => {
      live = false;
    };
  }, [invoice.id, invoice.paidKobo, state.attempt]);

  if (invoice.paidKobo === 0 && !state.error) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-fg">Payments</h3>
      {state.error ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger-fg">
          {state.error}
          <button
            type="button"
            className="focus-ring rounded font-semibold text-brand-fg"
            onClick={() => setState((s) => ({ ...s, attempt: s.attempt + 1 }))}
          >
            Try again
          </button>
        </p>
      ) : !state.list ? (
        <p role="status" className="flex items-center gap-2 text-sm text-fg-muted">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading payments…
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {state.list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 space-y-1">
                <span className="num block font-semibold text-fg">{formatNaira(p.amountKobo)}</span>
                <span className="block text-xs text-fg-muted">
                  {PAYMENT_METHOD_LABELS[p.method]} · {day(p.date)}
                  {p.reference && ` · ${p.reference}`}
                </span>
              </span>
              {canPay && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove the ${formatNaira(p.amountKobo)} payment`}
                  onClick={() => setRemoving(p)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove the ${removing ? formatNaira(removing.amountKobo) : ""} payment?`}
        description={`Only for one recorded by mistake: ${invoice.number} owes it again. It stays in the audit log.`}
        confirmLabel="Remove payment"
        onConfirm={async () => {
          await apiRequest(`/api/payments/${removing!.id}`, "DELETE");
          onChanged(`The ${formatNaira(removing!.amountKobo)} payment is removed: ${invoice.number} owes it again.`);
        }}
      />
    </section>
  );
}

/** Records money the customer paid: what's left by default, how, when and the reference. */
export function PaymentSheet({
  invoice,
  today,
  onClose,
  onSaved,
}: {
  invoice: InvoiceView;
  today: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [amount, setAmount] = React.useState<number | null>(invoice.balanceKobo);
  const [method, setMethod] = React.useState<PaymentMethod>("bank-transfer");
  const [date, setDate] = React.useState(today);
  const [reference, setReference] = React.useState("");
  const action = useAction();
  const after = invoice.balanceKobo - (amount ?? 0);
  const reason = !amount
    ? "Enter how much they paid."
    : amount > invoice.balanceKobo
      ? `Only ${formatNaira(invoice.balanceKobo)} is left to pay.`
      : "";

  return (
    <Sheet
      open
      onClose={() => !action.busy && onClose()}
      title="Record a payment"
      subtitle={`${invoice.number} · ${formatNaira(invoice.balanceKobo)} left to pay`}
      footer={
        <div className="space-y-2">
          <ActionFeedback action={action} />
          <Button
            size="lg"
            fullWidth
            loading={action.busy}
            disabled={!!reason}
            reason={reason || undefined}
            onClick={() =>
              void action.run(
                () =>
                  apiRequest<PaymentView>(`/api/invoices/${invoice.id}/payments`, "POST", {
                    amountKobo: amount,
                    method,
                    date,
                    reference,
                  }),
                {
                  onSuccess: (p) =>
                    onSaved(
                      after === 0
                        ? `${formatNaira(p.amountKobo)} recorded: ${invoice.number} is paid in full.`
                        : `${formatNaira(p.amountKobo)} recorded: ${formatNaira(after)} left on ${invoice.number}.`,
                    ),
                },
              )
            }
          >
            <HandCoins /> Record {amount ? formatNaira(amount) : "payment"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field
          id="amountKobo"
          label="Amount paid"
          error={action.fieldError("amountKobo")}
          hint={
            amount && after > 0 ? `${formatNaira(after)} will be left to pay` : amount ? "Pays it in full" : undefined
          }
        >
          {(a11y) => <MoneyInput {...a11y} value={amount} onChange={setAmount} />}
        </Field>
        <Segmented
          label="Paid by"
          className="w-full"
          value={method}
          onChange={setMethod}
          options={[
            { value: "bank-transfer", label: "Transfer" },
            { value: "cash", label: "Cash" },
            { value: "paystack", label: "Paystack" },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="date" label="Paid on" error={action.fieldError("date")}>
            {(a11y) => (
              <Input {...a11y} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>
          <Field id="reference" label="Reference" hint="Optional: the bank's or Paystack's">
            {(a11y) => (
              <Input {...a11y} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
            )}
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
