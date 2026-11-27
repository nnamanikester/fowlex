"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Receipt } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, Panel, StatCard } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import type { BatchCosts } from "@/lib/batches/costs";
import type { BatchView } from "@/lib/batches/service";
import { formatRange } from "@/lib/dates";
import { type CategoryView, categoryName } from "@/lib/expenses/categories";
import { APPROVAL_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/expenses/rules";
import { quantity } from "@/lib/inventory/rules";
import { formatNaira } from "@/lib/money";

const day = (d: string) => formatRange({ from: d, to: d });

/** Everything charged to a batch so far: its expenses and the stock it used, with the total. */
export function CostsTab({
  batch,
  costs,
  categories,
  canSpend,
}: {
  batch: BatchView;
  costs: BatchCosts;
  categories: CategoryView[];
  canSpend: boolean;
}) {
  const spend = canSpend && batch.phase !== "closed" && (
    <LinkButton href={`/expenses?spend=1&batch=${batch.id}`} size="sm">
      <Plus /> Spend for this batch
    </LinkButton>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cost so far" value={formatNaira(costs.totalKobo)} hint="Expenses and stock used" />
        <StatCard
          label="Per bird placed"
          value={batch.placed ? formatNaira(Math.round(costs.totalKobo / batch.placed)) : "–"}
          hint={`${batch.placed.toLocaleString("en-NG")} placed`}
        />
        <StatCard label="Expenses" value={formatNaira(costs.expensesKobo)} hint="Approved, for this batch" />
        <StatCard label="Stock used" value={formatNaira(costs.stockKobo)} hint="Feed and drugs, at average cost" />
      </div>
      {spend}

      <Panel title="Stock used" flush>
        {costs.stock.length ? (
          <ul className="divide-y divide-line">
            {costs.stock.map((s) => (
              <li key={s.itemId} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link href={`/inventory/${s.itemId}`} className="focus-ring min-w-0 rounded-md">
                  <span className="block truncate font-semibold text-fg">{s.name}</span>
                  <span className="block text-xs text-fg-muted">{quantity(s.quantity, s.unit as never)}</span>
                </Link>
                <span className="num shrink-0 font-semibold text-fg">{formatNaira(s.costKobo)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-fg-muted">
            Feed logged from stock in the daily log, and drugs used from stock, show here.
          </p>
        )}
      </Panel>

      <Panel title="Expenses" flush>
        {costs.expenses.length ? (
          <ul className="divide-y divide-line">
            {costs.expenses.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/expenses?open=${e.id}`}
                  className="focus-ring flex items-center gap-3 px-5 py-3 hover:bg-surface-subtle"
                >
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate font-semibold text-fg">
                      {e.description || categoryName(categories, e.category)}
                    </span>
                    <span className="block text-xs text-fg-muted">
                      {[
                        e.number,
                        day(e.date),
                        categoryName(categories, e.category),
                        e.capital && "spread over its life",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                    <span className="num block font-semibold text-fg">{formatNaira(e.amountKobo)}</span>
                    <Badge
                      tone={e.approval === "approved" ? (e.paymentStatus === "paid" ? "success" : "warning") : "info"}
                    >
                      {e.approval === "approved"
                        ? PAYMENT_STATUS_LABELS[e.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS]
                        : APPROVAL_LABELS[e.approval as keyof typeof APPROVAL_LABELS]}
                    </Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Receipt />}
            title="Nothing charged yet"
            description="The chicks, drugs, transport and anything else spent for this batch show here."
          />
        )}
      </Panel>
    </div>
  );
}

/** The batch's chick expense: its status and a link, or a way to record it for an older batch. */
export function ChicksExpense({ batch, canRecord }: { batch: BatchView; canRecord: boolean }) {
  const router = useRouter();
  const [paidBy, setPaidBy] = React.useState("transfer");
  const [busy, setBusy] = React.useState(false);
  const e = batch.chickExpense;
  if (e)
    return (
      <Link
        href={`/expenses?open=${e.id}`}
        className="focus-ring inline-flex items-center gap-2 rounded-md text-brand-fg"
      >
        {e.number}
        <Badge tone={e.approval !== "approved" ? "info" : e.paymentStatus === "paid" ? "success" : "warning"}>
          {e.approval !== "approved"
            ? APPROVAL_LABELS[e.approval as keyof typeof APPROVAL_LABELS]
            : PAYMENT_STATUS_LABELS[e.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS]}
        </Badge>
      </Link>
    );
  if (!canRecord || batch.chickCostKobo <= 0) return <>Not recorded</>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Chicks paid by"
        value={paidBy}
        onChange={(ev) => setPaidBy(ev.target.value)}
        className="h-9 w-auto py-1 text-sm"
      >
        <option value="transfer">Paid by transfer</option>
        <option value="cash">Paid in cash</option>
        <option value="pos">Paid by POS</option>
        <option value="later">Owed to the hatchery</option>
      </Select>
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await apiRequest(`/api/batches/${batch.id}/chicks`, "POST", { paidBy });
            toast.success(`${batch.code}'s chicks recorded under Expenses.`);
            router.refresh();
          } catch (error) {
            toast.error((error as AuthError).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Record the chick cost
      </Button>
    </span>
  );
}
