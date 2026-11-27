"use client";

import Link from "next/link";

import { when } from "./balance-board";
import { CopyButton } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { CATEGORY_LABELS, CHANNEL_LABELS } from "@/lib/balance/rules";
import type { EntryView } from "@/lib/balance/service";
import { formatNaira } from "@/lib/money";

/** One movement with everything an auditor asks: what, which way, who started it, how, and where to find it in Paystack. */
export function EntrySheet({ entry: e, onClose }: { entry: EntryView; onClose: () => void }) {
  const reference = e.paystack.reference ?? e.paystack.transferCode;
  return (
    <Sheet
      open
      onClose={onClose}
      title={e.description}
      subtitle={`${CATEGORY_LABELS[e.category]} · ${when(e.occurredAt)}`}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num font-display text-3xl font-bold text-fg-heading">
            {e.direction === "credit" ? "+" : "−"}
            {formatNaira(e.amountKobo)}
          </span>
          {e.confirmed ? (
            <Badge tone="success" dot>
              Confirmed by Paystack
            </Badge>
          ) : (
            <Badge tone="info" dot>
              Waiting for Paystack
            </Badge>
          )}
        </div>
        {!e.confirmed && (
          <p className="rounded-xl border border-info-line bg-info-subtle px-3 py-2.5 text-sm text-fg">
            Fowlex booked this the moment Paystack took the transfer. It&apos;s confirmed, with the exact fee, once
            Paystack&apos;s own record lists it.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Fact label="Money" value={e.direction === "credit" ? "In" : "Out"} />
          <Fact label="Balance after" value={formatNaira(e.balanceAfterKobo)} />
          <Fact label="How" value={CHANNEL_LABELS[e.channel]} />
          <Fact label="Started by" value={e.initiatedBy || (e.channel === "fowlex" ? "Someone on the team" : "–")} />
          {e.counterparty && (
            <div className="col-span-2">
              <dt className="text-xs font-semibold text-fg-muted">{e.direction === "credit" ? "From" : "To"}</dt>
              <dd className="text-fg">
                {e.counterparty.name}
                <span className="block text-fg-muted">
                  {e.counterparty.bankName} {e.counterparty.accountNumber}
                </span>
              </dd>
            </div>
          )}
          {e.expenseId && (
            <div className="col-span-2">
              <dt className="text-xs font-semibold text-fg-muted">For</dt>
              <dd>
                <Link
                  href={`/expenses?open=${e.expenseId}`}
                  className="focus-ring rounded font-semibold text-brand-fg underline-offset-4 hover:underline"
                >
                  The expense it paid
                </Link>
              </dd>
            </div>
          )}
        </dl>
        <section className="space-y-2 rounded-xl border border-line p-4 text-sm">
          <h3 className="font-semibold text-fg">To find it in Paystack</h3>
          <dl className="space-y-2">
            {reference && <Ref label="Transfer reference" value={reference} />}
            {e.paystack.transferCode && e.paystack.transferCode !== reference && (
              <Ref label="Transfer code" value={e.paystack.transferCode} />
            )}
            {e.paystack.transferId && <Ref label="Transfer id" value={e.paystack.transferId} />}
            {e.paystack.ledgerId && <Ref label="Balance history id" value={e.paystack.ledgerId} />}
            {e.paystack.reason && <Ref label="Paystack's note" value={e.paystack.reason} copy={false} />}
            {!reference && !e.paystack.ledgerId && (
              <p className="text-fg-muted">Fowlex&apos;s own record: nothing to look up.</p>
            )}
          </dl>
        </section>
      </div>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-fg-muted">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  );
}

function Ref({ label, value, copy = true }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-fg-muted">{label}</dt>
        <dd className="num break-all text-fg">{value}</dd>
      </div>
      {copy && <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />}
    </div>
  );
}
