"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";

import { ExpenseSheet, PAYMENT_TONE } from "./expense-sheet";
import { type SpendDefaults, SpendSheet } from "./spend-sheet";
import { EmptyState, Fab, Panel, StatCard } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { formatRange } from "@/lib/dates";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/expenses/rules";
import type { ExpenseView } from "@/lib/expenses/service";
import type { ItemView } from "@/lib/inventory/items";
import { formatNaira } from "@/lib/money";
import type { SupplierView } from "@/lib/suppliers/service";

type Filter = "all" | "owed" | "paid";
const day = (d: string) => formatRange({ from: d, to: d });

/** Shared by the Expenses, Inventory and supplier pages: spending and paying, with the same sheets. */
export type SpendProps = {
  suppliers: SupplierView[];
  items: ItemView[];
  batches: { id: string; code: string }[];
  allBatches?: { id: string; code: string }[];
  today: string;
  canWrite: boolean;
  canPay: boolean;
};

/** Opens the spend sheet, then the pay step when Paystack was chosen; and any expense's sheet. */
export function useSpending(props: SpendProps) {
  const router = useRouter();
  const [spending, setSpending] = React.useState<SpendDefaults | null>(null);
  const [open, setOpen] = React.useState<{ expense: ExpenseView; pay: boolean } | null>(null);
  const sheets = (
    <>
      {spending && (
        <SpendSheet
          {...props}
          defaults={spending}
          onClose={() => setSpending(null)}
          onSaved={(expense, { pay }) => {
            setSpending(null);
            toast.success(`${expense.number} recorded.`);
            router.refresh();
            if (pay) setOpen({ expense, pay: true });
          }}
        />
      )}
      {open && (
        <ExpenseSheet
          key={open.expense.id}
          expense={open.expense}
          suppliers={props.suppliers}
          items={props.items}
          batches={props.allBatches ?? props.batches}
          canWrite={props.canWrite}
          canPay={props.canPay}
          startPay={open.pay}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
  return { spend: setSpending, show: (expense: ExpenseView) => setOpen({ expense, pay: false }), sheets };
}

/** Every expense, newest first, with what's owed and spent this month. */
export function ExpensesBoard({ expenses, ...props }: SpendProps & { expenses: ExpenseView[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const { spend, show, sheets } = useSpending(props);
  const month = props.today.slice(0, 7);
  const owed = expenses.filter((e) => e.paymentStatus === "unpaid" || e.paymentStatus === "failed");
  const sending = expenses.filter((e) => e.paymentStatus === "paying" || e.paymentStatus === "otp");
  const shown = expenses.filter(
    (e) => filter === "all" || (filter === "paid" ? e.paymentStatus === "paid" : e.paymentStatus !== "paid"),
  );
  const suppliers = new Map(props.suppliers.map((s) => [s.id, s.name]));
  const sum = (list: ExpenseView[]) => list.reduce((n, e) => n + e.amountKobo, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Spent this month"
          value={formatNaira(sum(expenses.filter((e) => e.date.slice(0, 7) === month)))}
          hint={`${expenses.filter((e) => e.date.slice(0, 7) === month).length} expenses`}
        />
        <StatCard label="Owed" value={formatNaira(sum(owed))} hint={`${owed.length} not paid yet`} />
        {sending.length > 0 && (
          <StatCard label="On its way" value={formatNaira(sum(sending))} hint="Paystack transfers" />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "owed", label: "Owed" },
            { value: "paid", label: "Paid" },
          ]}
        />
        {props.canWrite && (
          <Button size="sm" className="hidden lg:inline-flex" onClick={() => spend({})}>
            <Plus /> Spend money
          </Button>
        )}
      </div>

      {shown.length ? (
        <Panel flush>
          <ul className="divide-y divide-line">
            {shown.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => show(e)}
                  className="focus-ring flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-fg">
                      {e.description || EXPENSE_CATEGORY_LABELS[e.category]}
                    </span>
                    <span className="block truncate text-xs text-fg-muted">
                      {[
                        day(e.date),
                        EXPENSE_CATEGORY_LABELS[e.category],
                        e.supplierId ? suppliers.get(e.supplierId) : e.payeeName,
                        e.receipt && "receipt",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
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
        </Panel>
      ) : (
        <Panel>
          <EmptyState
            icon={filter === "owed" ? <Wallet /> : <Receipt />}
            title={filter === "owed" ? "Nothing owed" : "No expenses yet"}
            description={
              filter === "owed"
                ? "Every expense is paid."
                : "Record stock you buy and every other cost, paid or owed. Receipts are optional."
            }
            action={
              props.canWrite && filter !== "owed" ? (
                <Button size="sm" onClick={() => spend({})}>
                  <Plus /> Spend money
                </Button>
              ) : undefined
            }
          />
        </Panel>
      )}
      {props.canWrite && <Fab label="Spend money" icon={<Plus />} onClick={() => spend({})} />}
      {sheets}
    </div>
  );
}
