import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, FileDown } from "lucide-react";

import { PayNow } from "../../_components/pay-now";

import { Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button-classes";
import { HttpError } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/current-user";
import { homeFor } from "@/lib/auth/permissions";
import { formatRange } from "@/lib/dates";
import { INVOICE_STATUS_LABELS, INVOICE_TONE } from "@/lib/invoices/rules";
import { formatNaira } from "@/lib/money";
import { requestToday } from "@/lib/page-data";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments/rules";
import { payLinkToken } from "@/lib/collections/service";
import { portalInvoice } from "@/lib/portal/service";
import { paystackMode } from "@/lib/paystack/client";
import { readSettings } from "@/lib/settings/service";

export const metadata: Metadata = { title: "Invoice" };

const day = (d: string) => formatRange({ from: d, to: d });

/** One of the customer's invoices: what it's for, what's left, how to pay, and the PDF. */
export default function PortalInvoicePage({ params }: PageProps<"/portal/invoices/[id]">) {
  return (
    <Suspense>
      <Invoice params={params} />
    </Suspense>
  );
}

async function Invoice({ params }: Pick<PageProps<"/portal/invoices/[id]">, "params">) {
  const user = await requireUser();
  if (user.role !== "customer") redirect(homeFor(user.role));
  const now = await requestToday();
  const { id } = await params;
  const found = await portalInvoice(user, id, now).catch((e: unknown) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  });
  if (!found) notFound();
  const { invoice: i, payments } = found;
  const settings = await readSettings(user.farmId);
  const owed = i.balanceKobo > 0;
  // Card, bank app or USSD: the invoice's own pay link.
  const payUrl = owed && i.state !== "void" ? `/pay/${await payLinkToken(user.farmId, i.id)}` : null;
  return (
    <>
      <Link
        href="/portal"
        className="focus-ring inline-flex items-center gap-1 rounded-md text-sm font-medium text-fg-muted hover:text-fg"
      >
        <ChevronLeft className="size-4" aria-hidden /> Back
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold text-fg-heading">
            {i.number} <Badge tone={INVOICE_TONE[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Badge>
          </h1>
          <p className="text-sm text-fg-muted">
            From {settings.businessName} · {day(i.issueDate)} · due {day(i.dueDate)}
          </p>
        </div>
        <a
          href={`/api/portal/invoices/${i.id}/pdf`}
          download
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          <FileDown /> PDF
        </a>
      </header>

      <section className="space-y-3 rounded-xl border border-line bg-surface p-5 shadow-card">
        <p className="num font-display text-3xl font-bold text-fg-heading">{formatNaira(i.balanceKobo)}</p>
        <p className="text-sm text-fg-muted">
          {owed ? (i.paidKobo ? `left of ${formatNaira(i.totalKobo)}` : "to pay") : "Paid in full. Thank you."}
        </p>
        {owed && (
          <>
            <PayNow invoiceId={i.id} payUrl={payUrl} simulated={paystackMode() === "simulated"} />
            {settings.bankName && settings.accountNumber && (
              <p className="text-sm text-fg">
                Or transfer to <strong>{settings.accountName || settings.businessName}</strong>, {settings.bankName}{" "}
                <strong className="num">{settings.accountNumber}</strong>, with <strong>{i.number}</strong> as the
                reference.
              </p>
            )}
          </>
        )}
      </section>

      <Panel title="What it's for" flush>
        <ul className="divide-y divide-line text-sm">
          {i.lines.map((l, n) => (
            <li key={n} className="num flex justify-between gap-3 px-5 py-2.5">
              <span className="min-w-0 text-fg">{l.description}</span>
              <span className="shrink-0 font-semibold text-fg">{formatNaira(l.amountKobo)}</span>
            </li>
          ))}
        </ul>
        <dl className="num space-y-1 border-t border-line px-5 py-3 text-sm">
          <Row label="Subtotal" value={formatNaira(i.subtotalKobo)} />
          {i.discountKobo > 0 && <Row label="Discount" value={`−${formatNaira(i.discountKobo)}`} />}
          {i.vatRateBps !== null && <Row label={`VAT ${i.vatRateBps / 100}%`} value={formatNaira(i.vatKobo)} />}
          <Row label="Total" value={formatNaira(i.totalKobo)} strong />
        </dl>
      </Panel>

      {payments.length > 0 && (
        <Panel title="Your payments" flush>
          <ul className="divide-y divide-line text-sm">
            {payments.map((p) => (
              <li key={p.id} className="num flex justify-between gap-3 px-5 py-2.5">
                <span className="text-fg">
                  {day(p.date)} · {PAYMENT_METHOD_LABELS[p.method]}
                  {p.reference && ` · ${p.reference}`}
                </span>
                <span className="font-semibold text-fg">{formatNaira(p.amountKobo)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
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
