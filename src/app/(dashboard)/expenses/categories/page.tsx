import { Suspense } from "react";
import type { Metadata } from "next";

import { CategoriesBoard } from "./_components/categories-board";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { ExpensesTabs } from "../_components/expenses-tabs";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { loadCategories, loadExpenses, requestToday } from "@/lib/page-data";

export const metadata: Metadata = { title: "Expense categories" };

export default function CategoriesPage() {
  return (
    <RequirePermission permission="expense.read">
      <PageHeader title="Expenses" description="What the farm spends on, and how much each month should take." />
      <ExpensesTabs current="categories" />
      <Suspense fallback={<PageSkeleton />}>
        <Categories />
      </Suspense>
    </RequirePermission>
  );
}

async function Categories() {
  const user = await requireUser();
  const now = await requestToday();
  const [categories, expenses] = await Promise.all([loadCategories(user.farmId), loadExpenses(user.farmId)]);
  return (
    <CategoriesBoard
      categories={categories}
      expenses={expenses}
      today={now}
      canManage={can(user.role, "settings.manage")}
    />
  );
}
