import { Suspense } from "react";
import type { Metadata } from "next";

import { ExpensesBoard } from "./_components/expenses-board";
import { ExpensesTabs } from "./_components/expenses-tabs";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import {
  loadBatches,
  loadCategories,
  loadExpenses,
  loadItems,
  loadRecurring,
  loadSuppliers,
  requestToday,
} from "@/lib/page-data";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  return (
    <RequirePermission permission="expense.read">
      <PageHeader
        title="Expenses"
        description="Everything the farm spends: stock bought, transport, repairs, and who you owe."
      />
      <ExpensesTabs current="expenses" />
      <Suspense fallback={<PageSkeleton />}>
        <Expenses searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

async function Expenses({ searchParams }: Pick<PageProps<"/expenses">, "searchParams">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const user = await requireUser();
  const now = await requestToday();
  const [expenses, suppliers, items, batches, categories, recurring] = await Promise.all([
    loadExpenses(user.farmId),
    loadSuppliers(user.farmId),
    loadItems(user.farmId),
    loadBatches(user.farmId),
    loadCategories(user.farmId),
    loadRecurring(user.farmId),
  ]);
  return (
    <ExpensesBoard
      expenses={expenses}
      recurring={recurring}
      openId={one(params.open)}
      payNow={one(params.pay) === "1"}
      spendForBatch={one(params.spend) ? (one(params.batch) ?? "") : undefined}
      categories={categories}
      suppliers={suppliers}
      items={items}
      batches={batches.filter((b) => b.phase !== "closed").map((b) => ({ id: b.id, code: b.code }))}
      allBatches={batches.map((b) => ({ id: b.id, code: b.code }))}
      today={now}
      canWrite={can(user.role, "expense.write")}
      canPay={can(user.role, "payout.send")}
      canApprove={can(user.role, "expense.approve")}
    />
  );
}
