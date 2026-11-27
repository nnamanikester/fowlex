"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Landmark, Pencil, Phone, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";

import { SupplierSheet } from "../../_components/suppliers-board";
import { PAYMENT_TONE } from "../../../expenses/_components/expense-sheet";
import { type SpendProps, useSpending } from "../../../expenses/_components/expenses-board";
import { EmptyState, Panel, StatCard } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRange } from "@/lib/dates";
import { categoryName } from "@/lib/expenses/categories";
import { PAYMENT_STATUS_LABELS } from "@/lib/expenses/rules";
import type { ExpenseView } from "@/lib/expenses/service";
import { formatNaira } from "@/lib/money";
import { formatPhone, maskAccount, SUPPLY_LABELS } from "@/lib/suppliers/rules";
import type { SupplierView } from "@/lib/suppliers/service";

const day = (d: string) => formatRange({ from: d, to: d });

/** One supplier: how to reach and pay them, what they're owed, and everything bought from them. */
export function SupplierDetail({
  supplier,
  expenses,
  canEdit,
  ...props
}: SpendProps & { supplier: SupplierView; expenses: ExpenseView[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const { spend, show, sheets } = useSpending(props);
  const { categories } = props;
  const owed = expenses.filter((e) => e.paymentStatus === "unpaid" || e.paymentStatus === "failed");
  const sending = expenses.filter((e) => e.paymentStatus === "paying" || e.paymentStatus === "otp");
  const sum = (list: ExpenseView[]) => list.reduce((n, e) => n + e.amountKobo, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/suppliers"
          className="focus-ring inline-flex items-center gap-1 rounded-md text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-4" aria-hidden /> Suppliers
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg-heading">{supplier.name}</h1>
            <p className="text-sm text-fg-muted">
              {supplier.supplies.map((s) => SUPPLY_LABELS[s]).join(" · ") || "Supplier"}
            </p>
          </div>
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {supplier.phone && (
            <a
              href={`tel:${supplier.phone}`}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md font-medium text-brand-fg"
            >
              <Phone className="size-4" aria-hidden /> {formatPhone(supplier.phone)}
            </a>
          )}
          {supplier.bank ? (
            <span className="inline-flex items-center gap-1.5 text-fg-muted">
              <Landmark className="size-4" aria-hidden /> {supplier.bank.accountName} · {supplier.bank.bankName}{" "}
              {maskAccount(supplier.bank.accountNumber)}
            </span>
          ) : (
            <span className="text-fg-subtle">No bank account: pay in cash or add one to pay from here</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="You owe" value={formatNaira(sum(owed))} hint={`${owed.length} not paid yet`} />
        <StatCard label="Bought in all" value={formatNaira(sum(expenses))} hint={`${expenses.length} purchases`} />
        {sending.length > 0 && (
          <StatCard label="On its way" value={formatNaira(sum(sending))} hint="Paystack transfers" />
        )}
      </div>

      {props.canWrite && (
        <Button onClick={() => spend({ supplierId: supplier.id, kind: props.items.length ? "stock" : "other" })}>
          <Plus /> Buy from {supplier.name}
        </Button>
      )}

      <Panel title="Purchases and payments" flush>
        {expenses.length ? (
          <ul className="divide-y divide-line">
            {expenses.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => show(e)}
                  className="focus-ring flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-fg">
                      {e.description || categoryName(categories, e.category)}
                    </span>
                    <span className="block text-xs text-fg-muted">
                      {e.number} · {day(e.date)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-semibold text-fg">{formatNaira(e.amountKobo)}</span>
                    <Badge tone={PAYMENT_TONE[e.paymentStatus]}>{PAYMENT_STATUS_LABELS[e.paymentStatus]}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Receipt />}
            title="Nothing bought yet"
            description={`Purchases from ${supplier.name} show here.`}
          />
        )}
      </Panel>

      {editing && (
        <SupplierSheet
          supplier={supplier}
          onClose={() => setEditing(false)}
          onSaved={(message) => {
            setEditing(false);
            toast.success(message);
            if (message.endsWith("deleted.")) router.replace("/suppliers");
            router.refresh();
          }}
        />
      )}
      {sheets}
    </div>
  );
}
