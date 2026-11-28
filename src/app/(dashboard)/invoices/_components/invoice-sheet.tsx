"use client";

import * as React from "react";
import Link from "next/link";
import { Ban, FileDown, HandCoins, Landmark, Send, Share2 } from "lucide-react";
import { toast } from "sonner";

import { PaymentSheet, PaymentsList } from "./payments-panel";

import { Field } from "@/components/auth";
import { ConfirmDialog } from "@/components/kit";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Sheet } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/auth/client";
import { formatRange } from "@/lib/dates";
import { INVOICE_STATUS_LABELS, INVOICE_TONE } from "@/lib/invoices/rules";
import type { InvoiceView } from "@/lib/invoices/service";
import { formatNaira } from "@/lib/money";
import type { CollectionView } from "@/lib/collections/service";
import { TransferAccount } from "@/components/payments/transfer-account";
import { useAction } from "@/lib/use-action";

const day = (d: string) => formatRange({ from: d, to: d });

/** One invoice: what it bills, what's left to pay, and sending, downloading or voiding it. */
export function InvoiceSheet({
  invoice: i,
  canWrite,
  canPay,
  today,
  simulated = false,
  onClose,
  onSaved,
}: {
  /** Paystack is simulated: transfer accounts can be paid from the screen, to try it. */
  simulated?: boolean;
  invoice: InvoiceView;
  canWrite: boolean;
  /** Can record the customer's payments. */
  canPay: boolean;
  today: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [discount, setDiscount] = React.useState<number | null>(i.discountKobo);
  const [dueDate, setDueDate] = React.useState(i.dueDate);
  const [notes, setNotes] = React.useState(i.notes);
  const [voiding, setVoiding] = React.useState(false);
  const [why, setWhy] = React.useState("");
  const [paying, setPaying] = React.useState(false);
  const [account, setAccount] = React.useState<CollectionView | null>(null);
  const action = useAction();
  const draft = i.state === "draft";
  const changed = draft && (discount !== i.discountKobo || dueDate !== i.dueDate || notes !== i.notes);

  return (
    <>
      <Sheet
        open
        onClose={() => !action.busy && onClose()}
        title={`${i.number} · ${i.customerName}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={INVOICE_TONE[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Badge>
            Due {day(i.dueDate)}
          </span>
        }
        footer={
          <div className="space-y-2">
            <ActionFeedback action={action} />
            {canPay && i.state !== "void" && i.balanceKobo > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="lg"
                  loading={action.isPending("collect")}
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() => apiRequest<CollectionView>(`/api/invoices/${i.id}/collect`, "POST"), {
                      key: "collect",
                      onSuccess: setAccount,
                    })
                  }
                >
                  <Landmark /> Pay by transfer
                </Button>
                <Button size="lg" variant="secondary" disabled={action.busy} onClick={() => setPaying(true)}>
                  <HandCoins /> Record a payment
                </Button>
                <Button
                  variant="secondary"
                  className="col-span-2"
                  loading={action.isPending("link")}
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() => apiRequest<{ url: string }>(`/api/invoices/${i.id}/pay-link`, "POST"), {
                      key: "link",
                      onSuccess: ({ url }) => void sharePayLink(url, i.number, i.balanceKobo),
                    })
                  }
                >
                  <Share2 /> Send pay link
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`/api/invoices/${i.id}/pdf`}
                download
                className={buttonClasses({ variant: "secondary", size: "lg" })}
              >
                <FileDown /> PDF
              </a>
              {canWrite && i.state !== "void" && (
                <Button
                  size="lg"
                  loading={action.isPending("send")}
                  disabled={action.busy || !i.customerEmail}
                  reason={
                    !i.customerEmail ? `Add ${i.customerName}'s email on their page to send invoices.` : undefined
                  }
                  onClick={() =>
                    void action.run(() => apiRequest<InvoiceView>(`/api/invoices/${i.id}/send`, "POST"), {
                      key: "send",
                      onSuccess: (sent) => onSaved(`${sent.number} sent to ${sent.sentTo}.`),
                    })
                  }
                >
                  <Send /> {i.sentAt ? "Send again" : "Send"}
                </Button>
              )}
            </div>
            {canWrite && changed && (
              <Button
                variant="secondary"
                fullWidth
                loading={action.isPending("save")}
                disabled={action.busy}
                onClick={() =>
                  void action.run(
                    () =>
                      apiRequest<InvoiceView>(`/api/invoices/${i.id}`, "PATCH", {
                        discountKobo: discount ?? 0,
                        dueDate,
                        notes,
                        version: i.version,
                      }),
                    { key: "save", onSuccess: (saved) => onSaved(`${saved.number} saved.`) },
                  )
                }
              >
                Save changes
              </Button>
            )}
            {canWrite && i.state !== "void" && i.paidKobo === 0 && (
              <Button
                variant="ghost"
                fullWidth
                className="text-danger-fg"
                disabled={action.busy}
                onClick={() => setVoiding(true)}
              >
                <Ban /> Void it
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-5">
          {i.state === "void" && (
            <p className="rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-fg">
              <strong>Void:</strong> {i.voidReason} Its number is kept, and its orders can be invoiced again.
            </p>
          )}
          {draft && (
            <p className="rounded-xl border border-info-line bg-info-subtle px-3 py-2.5 text-sm text-fg">
              A draft: check it, then send it. Once sent it stays as the customer has it.
            </p>
          )}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num font-display text-3xl font-bold text-fg-heading">{formatNaira(i.balanceKobo)}</span>
            <span className="text-sm text-fg-muted">
              {i.status === "paid" ? "paid in full" : i.paidKobo ? `left of ${formatNaira(i.totalKobo)}` : "to pay"}
            </span>
          </div>

          <div className="rounded-xl border border-line">
            <ul className="divide-y divide-line text-sm">
              {i.lines.map((l, n) => (
                <li key={n} className="num flex justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 text-fg">{l.description}</span>
                  <span className="shrink-0 font-semibold text-fg">{formatNaira(l.amountKobo)}</span>
                </li>
              ))}
            </ul>
            <dl className="num space-y-1 border-t border-line px-4 py-3 text-sm">
              <Row label="Subtotal" value={formatNaira(i.subtotalKobo)} />
              {i.discountKobo > 0 && <Row label="Discount" value={`−${formatNaira(i.discountKobo)}`} />}
              {i.vatRateBps !== null && <Row label={`VAT ${i.vatRateBps / 100}%`} value={formatNaira(i.vatKobo)} />}
              <Row label="Total" value={formatNaira(i.totalKobo)} strong />
              {i.paidKobo > 0 && <Row label="Paid" value={`−${formatNaira(i.paidKobo)}`} />}
            </dl>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Fact label="Invoice date" value={day(i.issueDate)} />
            <Fact label="Due" value={day(i.dueDate)} />
            <Fact label="Sent" value={i.sentAt ? `To ${i.sentTo}` : "Not yet"} />
            <div>
              <dt className="text-xs font-semibold text-fg-muted">Customer</dt>
              <dd>
                <Link href={`/customers/${i.customerId}`} className="focus-ring rounded font-semibold text-brand-fg">
                  {i.customerName}
                </Link>
              </dd>
            </div>
          </dl>

          {canWrite && draft && (
            <fieldset className="min-w-0 space-y-3 rounded-xl border border-line p-4">
              <legend className="px-1 text-sm font-semibold text-fg">Before you send it</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="discountKobo" label="Discount" error={action.fieldError("discountKobo")}>
                  {(a11y) => <MoneyInput {...a11y} value={discount} onChange={setDiscount} placeholder="0.00" />}
                </Field>
                <Field id="dueDate" label="Due" error={action.fieldError("dueDate")}>
                  {(a11y) => (
                    <Input
                      {...a11y}
                      type="date"
                      value={dueDate}
                      min={i.issueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <Field id="invoice-notes" label="Note on the invoice">
                {(a11y) => (
                  <Textarea
                    {...a11y}
                    rows={2}
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                )}
              </Field>
            </fieldset>
          )}
          <PaymentsList invoice={i} canPay={canPay} onChanged={onSaved} />
          {!draft && i.notes && <p className="text-sm text-fg-muted">{i.notes}</p>}
        </div>
      </Sheet>
      {account && (
        <Sheet
          open
          onClose={() => setAccount(null)}
          title="Pay by transfer"
          subtitle={`${i.number} · ${i.customerName}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              Give them this account: it&apos;s for this invoice only, and it&apos;s marked paid by itself when the
              money lands.
            </p>
            <TransferAccount
              collection={account}
              checkUrl={(id) => `/api/collections/${id}`}
              simulated={simulated}
              onPaid={(c) => onSaved(`Paid by transfer: ${formatNaira(c.amountKobo)} for ${c.invoiceNumber}.`)}
              onNew={() =>
                void action.run(() => apiRequest<CollectionView>(`/api/invoices/${i.id}/collect`, "POST"), {
                  toastError: true,
                  onSuccess: setAccount,
                })
              }
            />
          </div>
        </Sheet>
      )}
      {paying && <PaymentSheet invoice={i} today={today} onClose={() => setPaying(false)} onSaved={onSaved} />}
      <ConfirmDialog
        open={voiding}
        onOpenChange={setVoiding}
        title={`Void ${i.number}?`}
        description={
          <span className="block space-y-3">
            <span className="block">
              It keeps its number, and its orders can be invoiced again. Say why, for the record.
            </span>
            <Textarea
              aria-label="Why it's void"
              rows={2}
              maxLength={300}
              placeholder="Billed to the wrong customer"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
            />
          </span>
        }
        confirmLabel="Void invoice"
        onConfirm={async () => {
          await apiRequest(`/api/invoices/${i.id}/void`, "POST", { reason: why });
          onSaved(`${i.number} is void.`);
        }}
      />
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between font-semibold text-fg" : "flex justify-between text-fg-muted"}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-fg-muted">{label}</dt>
      <dd className="truncate text-fg">{value}</dd>
    </div>
  );
}

/**
 * Sends a pay link the way people send things: the phone's share sheet (WhatsApp, SMS), or the
 * link copied, ready to paste.
 */
async function sharePayLink(url: string, number: string, balanceKobo: number) {
  const text = `Pay ${number} (${formatNaira(balanceKobo)}) by card, bank app, USSD or transfer: ${url}`;
  if (typeof navigator.share === "function") {
    const shared = await navigator.share({ title: `Pay ${number}`, text }).then(
      () => true,
      () => false,
    );
    if (shared) return;
  }
  const copied = await navigator.clipboard?.writeText(url).then(
    () => true,
    () => false,
  );
  if (copied) toast.success("Pay link copied: paste it to the customer.");
  else toast.message(url);
}
