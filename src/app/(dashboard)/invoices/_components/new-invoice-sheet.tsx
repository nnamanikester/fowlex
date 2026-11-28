"use client";

import * as React from "react";
import { LoaderCircle, Send } from "lucide-react";

import { Field } from "@/components/auth";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { apiRequest, asProblem } from "@/lib/auth/client";
import { formatRange } from "@/lib/dates";
import { invoiceTotals } from "@/lib/invoices/rules";
import type { InvoiceView } from "@/lib/invoices/service";
import { formatNaira } from "@/lib/money";
import type { OrderView } from "@/lib/sales/service";
import { useAction } from "@/lib/use-action";

const day = (d: string) => formatRange({ from: d, to: d });

/**
 * Bills a customer: their delivered orders not yet on an invoice, all ticked; a discount; the
 * totals with VAT as Settings has it. Saved as a draft to check, or made and emailed at once.
 */
export function NewInvoiceSheet({
  customers,
  customerId: initialCustomer,
  orderIds,
  vatRateBps,
  today,
  onClose,
  onSaved,
}: {
  customers: { id: string; name: string; email: string }[];
  customerId?: string;
  /** Orders to tick to start with; all of the customer's when none are given. */
  orderIds?: string[];
  vatRateBps: number | null;
  today: string;
  onClose: () => void;
  onSaved: (message: string, invoice: InvoiceView) => void;
}) {
  const [customerId, setCustomerId] = React.useState(initialCustomer ?? "");
  const [orders, setOrders] = React.useState<{ key: string; list: OrderView[] | null; error?: string }>({
    key: "",
    list: null,
  });
  const [picked, setPicked] = React.useState<Set<string> | null>(orderIds ? new Set(orderIds) : null);
  const [discount, setDiscount] = React.useState<number | null>(0);
  const [issueDate, setIssueDate] = React.useState(today);
  const [notes, setNotes] = React.useState("");
  const action = useAction();
  const customer = customers.find((c) => c.id === customerId);

  React.useEffect(() => {
    if (!customerId) return;
    let live = true;
    apiRequest<OrderView[]>(`/api/sales?customerId=${customerId}`, "GET").then(
      (all) => live && setOrders({ key: customerId, list: all.filter((o) => o.status === "delivered") }),
      (e: { message: string }) => live && setOrders({ key: customerId, list: [], error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [customerId]);

  const list = orders.key === customerId ? orders.list : null;
  const chosen = list ? list.filter((o) => (picked ? picked.has(o.id) : true)) : [];
  const totals = invoiceTotals(
    chosen.map((o) => ({ amountKobo: o.totalKobo })),
    discount ?? 0,
    vatRateBps,
  );
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p ?? list?.map((o) => o.id) ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reason = !customerId
    ? "Choose the customer first."
    : !list
      ? "Loading their orders…"
      : !list.length
        ? "They have no delivered orders to invoice."
        : !chosen.length
          ? "Tick at least one order."
          : (discount ?? 0) > totals.subtotalKobo
            ? "The discount is more than the invoice."
            : "";
  const create = (send: boolean) =>
    void action.run(
      async () => {
        const made = await apiRequest<InvoiceView>("/api/invoices", "POST", {
          orderIds: chosen.map((o) => o.id),
          discountKobo: discount ?? 0,
          issueDate,
          notes,
        });
        if (!send) return { invoice: made, message: `${made.number} saved as a draft to check.` };
        // Made but not sent (email trouble): keep the draft and say so, rather than lose it.
        try {
          const sent = await apiRequest<InvoiceView>(`/api/invoices/${made.id}/send`, "POST");
          return { invoice: sent, message: `${sent.number} sent to ${sent.sentTo}.` };
        } catch (e) {
          return {
            invoice: made,
            message: `${made.number} is saved as a draft, but it couldn't be sent: ${asProblem(e).message}`,
          };
        }
      },
      { key: send ? "send" : "draft", onSuccess: ({ invoice, message }) => onSaved(message, invoice) },
    );

  return (
    <Sheet
      open
      onClose={() => !action.busy && onClose()}
      title="New invoice"
      subtitle={customer ? `For ${customer.name}` : "Bill a customer for delivered orders"}
      footer={
        <div className="space-y-2">
          <dl className="num space-y-1 text-sm" aria-live="polite">
            <div className="flex justify-between text-fg-muted">
              <dt>Subtotal</dt>
              <dd>{formatNaira(totals.subtotalKobo)}</dd>
            </div>
            {totals.discountKobo > 0 && (
              <div className="flex justify-between text-fg-muted">
                <dt>Discount</dt>
                <dd>−{formatNaira(totals.discountKobo)}</dd>
              </div>
            )}
            {vatRateBps && (
              <div className="flex justify-between text-fg-muted">
                <dt>VAT {vatRateBps / 100}%</dt>
                <dd>{formatNaira(totals.vatKobo)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold text-fg">
              <dt>Total</dt>
              <dd>{formatNaira(totals.totalKobo)}</dd>
            </div>
          </dl>
          <ActionFeedback action={action} />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="lg"
              loading={action.isPending("draft")}
              disabled={!!reason || action.busy}
              reason={reason || undefined}
              onClick={() => create(false)}
            >
              Save as draft
            </Button>
            <Button
              size="lg"
              loading={action.isPending("send")}
              disabled={!!reason || action.busy || !customer?.email}
              reason={reason || (!customer?.email ? "Add their email on their page to send it." : undefined)}
              onClick={() => create(true)}
            >
              <Send /> Create and send
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {!initialCustomer && (
          <Field id="customerId" label="Customer">
            {(a11y) => (
              <Select
                {...a11y}
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setPicked(null);
                }}
              >
                <option value="">Choose the customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        {customerId && (
          <fieldset className="min-w-0 space-y-2">
            <legend className="mb-1 text-sm font-semibold text-fg">Delivered orders to bill</legend>
            {!list ? (
              <p role="status" className="flex items-center gap-2 text-sm text-fg-muted">
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading their orders…
              </p>
            ) : orders.error ? (
              <p role="alert" className="text-sm text-danger-fg">
                {orders.error}
              </p>
            ) : list.length === 0 ? (
              <p className="rounded-xl border border-line px-3 py-2.5 text-sm text-fg-muted">
                Nothing to bill: invoices are made from orders once they&apos;re delivered.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {list.map((o) => (
                  <li key={o.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        className="size-5 accent-[rgb(var(--brand))]"
                        checked={picked ? picked.has(o.id) : true}
                        onChange={() => toggle(o.id)}
                      />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block font-semibold text-fg">{o.number}</span>
                        <span className="num block text-xs text-fg-muted">
                          {o.lines.reduce((n, l) => n + l.birds, 0).toLocaleString("en-NG")} birds · delivered{" "}
                          {day(o.deliveredOn ?? o.deliveryDate)}
                        </span>
                      </span>
                      <span className="num font-semibold text-fg">{formatNaira(o.totalKobo)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="discountKobo" label="Discount" error={action.fieldError("discountKobo")} hint="Optional">
            {(a11y) => <MoneyInput {...a11y} value={discount} onChange={setDiscount} placeholder="0.00" />}
          </Field>
          <Field id="issueDate" label="Invoice date" error={action.fieldError("issueDate")}>
            {(a11y) => (
              <Input
                {...a11y}
                type="date"
                value={issueDate}
                max={today}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field id="notes" label="Note on the invoice" hint="Optional: shown to the customer">
          {(a11y) => (
            <Textarea {...a11y} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
      </div>
    </Sheet>
  );
}
