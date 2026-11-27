"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Receipt, Search, Wallet } from "lucide-react";
import { toast } from "sonner";

import { ExpenseSheet, PAYMENT_TONE } from "./expense-sheet";
import { BudgetsPanel } from "./budget-bars";
import { RepeatsPanel } from "./repeats-panel";
import { type SpendDefaults, SpendSheet } from "./spend-sheet";
import { EmptyState, Fab, Panel, StatCard } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { formatRange } from "@/lib/dates";
import { APPROVAL_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/expenses/rules";
import { type CategoryView, categoryName } from "@/lib/expenses/categories";
import { budgetRows } from "@/lib/expenses/budget";
import type { ExpenseView } from "@/lib/expenses/service";
import type { RecurringView } from "@/lib/recurring/service";
import type { ItemView } from "@/lib/inventory/items";
import { formatNaira } from "@/lib/money";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { downloadCsv, toCsv } from "@/lib/csv";
import { CSV_HEADER, expenseMonths, expenseRows, filterExpenses } from "@/lib/expenses/filter";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SupplierView } from "@/lib/suppliers/service";

type Filter = "all" | "owed" | "paid";
const day = (d: string) => formatRange({ from: d, to: d });

/** Shared by the Expenses, Inventory and supplier pages: spending and paying, with the same sheets. */
export type SpendProps = {
  /** The farm's expense categories, with their names. */
  categories: CategoryView[];
  suppliers: SupplierView[];
  items: ItemView[];
  batches: { id: string; code: string }[];
  allBatches?: { id: string; code: string }[];
  today: string;
  canWrite: boolean;
  canPay: boolean;
  /** Owners: approve what managers spend above the approval limit. */
  canApprove?: boolean;
};

/** Opens the spend sheet, then the pay step when Paystack was chosen; and any expense's sheet. */
export function useSpending(
  props: SpendProps,
  initial: { spend?: SpendDefaults | null; open?: ExpenseView | null; pay?: boolean } = {},
) {
  const router = useRouter();
  const [spending, setSpending] = React.useState<SpendDefaults | null>(initial.spend ?? null);
  const [open, setOpen] = React.useState<{ expense: ExpenseView; pay: boolean } | null>(
    initial.open ? { expense: initial.open, pay: initial.pay ?? false } : null,
  );
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
          categories={props.categories}
          suppliers={props.suppliers}
          items={props.items}
          batches={props.allBatches ?? props.batches}
          canWrite={props.canWrite}
          canPay={props.canPay}
          canApprove={props.canApprove ?? false}
          startPay={open.pay}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
  return { spend: setSpending, show: (expense: ExpenseView) => setOpen({ expense, pay: false }), sheets };
}

/** Every expense, newest first, with what's owed and spent this month. */
export function ExpensesBoard({
  expenses,
  recurring = [],
  openId,
  payNow = false,
  spendForBatch,
  ...props
}: SpendProps & {
  expenses: ExpenseView[];
  recurring?: RecurringView[];
  /** Opens this expense (a link from a batch or elsewhere). */
  openId?: string;
  /** And goes straight to paying it (after booking chicks to pay through Paystack). */
  payNow?: boolean;
  /** Opens Spend money charged to this batch. */
  spendForBatch?: string;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [monthFilter, setMonthFilter] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const { categories } = props;
  const { spend, show, sheets } = useSpending(props, {
    open: expenses.find((e) => e.id === openId) ?? null,
    pay: payNow,
    spend: spendForBatch ? { kind: "other", batchId: spendForBatch } : null,
  });
  const month = props.today.slice(0, 7);
  // Only approved spending counts; rejected spending isn't owed.
  const counted = expenses.filter((e) => e.approval === "approved");
  const waiting = expenses.filter((e) => e.approval === "pending");
  const owed = expenses.filter(
    (e) => e.approval !== "rejected" && (e.paymentStatus === "unpaid" || e.paymentStatus === "failed"),
  );
  const sending = expenses.filter((e) => e.paymentStatus === "paying" || e.paymentStatus === "otp");
  const lookups = {
    categories,
    suppliers: new Map(props.suppliers.map((s) => [s.id, s.name])),
    batches: new Map((props.allBatches ?? props.batches).map((b) => [b.id, b.code])),
  };
  const shown = filterExpenses(
    expenses,
    { query, month: monthFilter, category: categoryFilter, status: filter },
    lookups,
  );
  const suppliers = new Map(props.suppliers.map((s) => [s.id, s.name]));
  const sum = (list: ExpenseView[]) => list.reduce((n, e) => n + e.amountKobo, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Spent this month"
          value={formatNaira(sum(counted.filter((e) => e.date.slice(0, 7) === month)))}
          hint={
            waiting.length
              ? `${formatNaira(sum(waiting))} more waiting for approval`
              : `${counted.filter((e) => e.date.slice(0, 7) === month).length} expenses`
          }
        />
        <StatCard label="Owed" value={formatNaira(sum(owed))} hint={`${owed.length} not paid yet`} />
        {sending.length > 0 && (
          <StatCard label="On its way" value={formatNaira(sum(sending))} hint="Paystack transfers" />
        )}
      </div>

      <BudgetsPanel rows={budgetRows(categories, expenses, month)} />
      <RepeatsPanel recurring={recurring} categories={categories} canWrite={props.canWrite} />

      {props.canApprove && waiting.length > 0 && (
        <ApprovalQueue expenses={waiting} categories={categories} onReview={show} />
      )}

      {expenses.length > 0 && (
        <div className="space-y-2">
          <label className="relative block">
            <span className="sr-only">Search expenses</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search by what, who or number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select
              aria-label="Month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="sm:w-48"
            >
              <option value="">Every month</option>
              {expenseMonths(expenses).map((m) => (
                <option key={m} value={m}>
                  {new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" }).format(
                    new Date(`${m}-01T00:00:00Z`),
                  )}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="sm:w-56"
            >
              <option value="">Every category</option>
              {categories
                .filter((c) => expenses.some((e) => e.category === c.key))
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </div>
        </div>
      )}

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
        <div className="flex gap-2">
          {shown.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                downloadCsv(
                  `fowlex-expenses-${monthFilter || props.today}.csv`,
                  toCsv(CSV_HEADER, expenseRows(shown, lookups)),
                )
              }
            >
              <Download /> Export
            </Button>
          )}
          {props.canWrite && (
            <Button size="sm" className="hidden lg:inline-flex" onClick={() => spend({})}>
              <Plus /> Spend money
            </Button>
          )}
        </div>
      </div>
      {shown.length > 0 && shown.length !== expenses.length && (
        <p className="num text-sm text-fg-muted" aria-live="polite">
          {shown.length} expense{shown.length === 1 ? "" : "s"} · {formatNaira(sum(shown))}
        </p>
      )}

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
                      {e.description || categoryName(categories, e.category)}
                    </span>
                    <span className="block truncate text-xs text-fg-muted">
                      {[
                        day(e.date),
                        categoryName(categories, e.category),
                        e.supplierId ? suppliers.get(e.supplierId) : e.payeeName,
                        e.receipt && "receipt",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-semibold text-fg">{formatNaira(e.amountKobo)}</span>
                    {e.approval === "approved" ? (
                      <Badge tone={PAYMENT_TONE[e.paymentStatus]}>{PAYMENT_STATUS_LABELS[e.paymentStatus]}</Badge>
                    ) : (
                      <Badge tone={e.approval === "pending" ? "info" : "danger"}>{APPROVAL_LABELS[e.approval]}</Badge>
                    )}
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
            title={
              expenses.length && (query || monthFilter || categoryFilter)
                ? "No matching expenses"
                : filter === "owed"
                  ? "Nothing owed"
                  : "No expenses yet"
            }
            description={
              expenses.length && (query || monthFilter || categoryFilter)
                ? "Try other words, or every month and category."
                : filter === "owed"
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

/** Owners: what managers spent above the approval limit, approved in a tap or opened to reject. */
function ApprovalQueue({
  expenses,
  categories,
  onReview,
}: {
  expenses: ExpenseView[];
  categories: CategoryView[];
  onReview: (e: ExpenseView) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const approve = async (e: ExpenseView) => {
    setBusy(e.id);
    try {
      await apiRequest(`/api/expenses/${e.id}/approve`, "POST");
      toast.success(`${e.number} approved.`);
      router.refresh();
    } catch (error) {
      toast.error((error as AuthError).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel
      title={`Waiting for your approval (${expenses.length})`}
      description="Above your approval limit: they don't count until you approve them."
      flush
    >
      <ul className="divide-y divide-line">
        {expenses.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-5 py-3">
            <button
              type="button"
              onClick={() => onReview(e)}
              className="focus-ring min-w-0 flex-1 rounded-md text-left"
            >
              <span className="block truncate font-semibold text-fg">
                {e.description || categoryName(categories, e.category)}
              </span>
              <span className="num block text-xs text-fg-muted">
                {e.number} · {formatNaira(e.amountKobo)}
              </span>
            </button>
            <Button
              size="sm"
              loading={busy === e.id}
              onClick={() => void approve(e)}
              aria-label={`Approve ${e.number}`}
            >
              Approve
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
