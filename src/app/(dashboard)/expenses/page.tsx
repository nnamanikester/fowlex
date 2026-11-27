import { Suspense } from "react";
import type { Metadata } from "next";

import { ExpensesBoard } from "./_components/expenses-board";
import { ExpensesTabs } from "./_components/expenses-tabs";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { loadBatches, loadCategories, loadExpenses, loadItems, loadSuppliers } from "@/lib/page-data";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage() {
  return (
    <RequirePermission permission="expense.read">
      <PageHeader
        title="Expenses"
        description="Everything the farm spends: stock bought, transport, repairs, and who you owe."
      />
      <ExpensesTabs current="expenses" />
      <Suspense fallback={<PageSkeleton />}>
        <Expenses />
      </Suspense>
    </RequirePermission>
  );
}

async function Expenses() {
  const user = await requireUser();
  const [expenses, suppliers, items, batches, categories] = await Promise.all([
    loadExpenses(user.farmId),
    loadSuppliers(user.farmId),
    loadItems(user.farmId),
    loadBatches(user.farmId),
    loadCategories(user.farmId),
  ]);
  return (
    <ExpensesBoard
      expenses={expenses}
      categories={categories}
      suppliers={suppliers}
      items={items}
      batches={batches.filter((b) => b.phase !== "closed").map((b) => ({ id: b.id, code: b.code }))}
      allBatches={batches.map((b) => ({ id: b.id, code: b.code }))}
      today={today()}
      canWrite={can(user.role, "expense.write")}
      canPay={can(user.role, "payout.send")}
      canApprove={can(user.role, "expense.approve")}
    />
  );
}
