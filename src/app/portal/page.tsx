import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Landmark } from "lucide-react";

import { StatementDownload } from "./_components/statement-download";
import { PortalSignOut } from "./sign-out";
import { EmptyState, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { HttpError } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/current-user";
import { homeFor } from "@/lib/auth/permissions";
import { PER_UNIT, STATUS_LABELS } from "@/lib/contracts/rules";
import { formatRange } from "@/lib/dates";
import { INVOICE_STATUS_LABELS, INVOICE_TONE } from "@/lib/invoices/rules";
import { formatNaira } from "@/lib/money";
import { requestToday } from "@/lib/page-data";
import { portalHome } from "@/lib/portal/service";
import { ORDER_STATUS_LABELS, ORDER_TONE } from "@/lib/sales/rules";

export const metadata: Metadata = { title: "Customer portal" };

const day = (d: string) => formatRange({ from: d, to: d });

/** Where customers land: what they owe and how to pay, their invoices, orders, contracts and statement. */
export default function PortalPage() {
  return (
    <Suspense>
      <Portal />
    </Suspense>
  );
}

async function Portal() {
  const user = await requireUser();
  if (user.role !== "customer") redirect(homeFor(user.role));
  const now = await requestToday();
  const home = await portalHome(user, now).catch((e: unknown) => {
    if (e instanceof HttpError && e.code === "no_customer") return null;
    throw e;
  });
  if (!home)
    return (
      <>
        <Header name={user.name} />
        <Panel>
          <EmptyState
            title="Your account isn't linked yet"
            description="Ask the farm to send you a new invite from your customer page, then sign in with it."
          />
        </Panel>
      </>
    );
  const unpaid = home.invoices.filter((i) => i.balanceKobo > 0);
  return (
    <>
      <Header name={user.name} farm={home.farm.name} />

      <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <p className="text-sm text-fg-muted">You owe {home.farm.name}</p>
        <p className="num font-display text-3xl font-bold text-fg-heading">{formatNaira(home.owedKobo)}</p>
        <p className="mt-1 text-sm text-fg-muted">
          {unpaid.length === 0
            ? "Nothing to pay. Thank you."
            : unpaid.length === 1
              ? `On 1 invoice, due ${day(unpaid[0].dueDate)}.`
              : `On ${unpaid.length} invoices.`}
        </p>
        {home.farm.bank && home.owedKobo > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-surface-subtle px-3 py-2.5 text-sm text-fg">
            <Landmark className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
            <span>
              Pay by transfer to <strong>{home.farm.bank.accountName}</strong>, {home.farm.bank.bankName}{" "}
              <strong className="num">{home.farm.bank.accountNumber}</strong>, with the invoice number as the reference.
            </span>
          </p>
        )}
      </section>

      <Panel title="Invoices" flush>
        {home.invoices.length === 0 ? (
          <EmptyState title="No invoices yet" description="Invoices for your orders show here once they're sent." />
        ) : (
          <ul className="divide-y divide-line">
            {home.invoices.map((i) => (
              <li key={i.id}>
                <Link
                  href={`/portal/invoices/${i.id}`}
                  className="focus-ring flex items-center gap-3 px-5 py-3.5 hover:bg-surface-subtle"
                >
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block font-semibold text-fg">{i.number}</span>
                    <span className="num block text-xs text-fg-muted">
                      {day(i.issueDate)} · due {day(i.dueDate)}
                    </span>
                  </span>
                  <span className="num flex shrink-0 flex-col items-end gap-1.5 text-right">
                    <span className="block font-semibold text-fg">{formatNaira(i.balanceKobo || i.totalKobo)}</span>
                    <Badge tone={INVOICE_TONE[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Badge>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Statement" description="Everything billed and paid over a period, as a PDF.">
        <StatementDownload today={now} />
      </Panel>

      <Panel title="Orders" flush>
        {home.orders.length === 0 ? (
          <EmptyState title="No orders yet" description="Your orders of birds show here." />
        ) : (
          <ul className="divide-y divide-line">
            {home.orders.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold text-fg">{o.number}</span>
                  <span className="num block text-xs text-fg-muted">
                    {o.lines.reduce((n, l) => n + l.birds, 0).toLocaleString("en-NG")} birds ·{" "}
                    {day(o.deliveredOn ?? o.deliveryDate)}
                  </span>
                </span>
                <span className="num flex shrink-0 flex-col items-end gap-1.5 text-right">
                  <span className="block font-semibold text-fg">{formatNaira(o.totalKobo)}</span>
                  <Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {home.contracts.length > 0 && (
        <Panel title="Contracts" flush>
          <ul className="divide-y divide-line">
            {home.contracts.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold text-fg">{c.number}</span>
                  <span className="num block text-xs text-fg-muted">
                    {formatRange({ from: c.startDate, to: c.terminatedOn ?? c.endDate })} · pay in {c.termsDays} days
                  </span>
                </span>
                <span className="num flex shrink-0 flex-col items-end gap-1.5 text-right">
                  <span className="block font-semibold text-fg">
                    {formatNaira(c.priceKobo)} <span className="font-normal text-fg-muted">{PER_UNIT[c.pricing]}</span>
                  </span>
                  <Badge tone={c.status === "active" ? "success" : "neutral"}>{STATUS_LABELS[c.status]}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {(home.farm.phone || home.farm.email) && (
        <p className="text-center text-sm text-fg-muted">
          Questions? Call {home.farm.name}
          {home.farm.phone && ` on ${home.farm.phone}`}
          {home.farm.email && ` or email ${home.farm.email}`}.
        </p>
      )}
    </>
  );
}

function Header({ name, farm }: { name: string; farm?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {farm && <p className="text-sm font-semibold text-brand-fg">{farm}</p>}
        <h1 className="font-display text-2xl font-bold text-fg-heading [overflow-wrap:anywhere]">Welcome, {name}</h1>
      </div>
      <PortalSignOut />
    </header>
  );
}
