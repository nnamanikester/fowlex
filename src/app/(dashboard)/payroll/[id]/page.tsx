import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RunDetail } from "../_components/run-detail";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { loadBatches, loadCategories, loadExpenses, loadItems, loadSuppliers } from "@/lib/page-data";
import { getRun } from "@/lib/payroll/service";

export const metadata: Metadata = { title: "Pay" };

export default function RunPage({ params }: PageProps<"/payroll/[id]">) {
  return (
    <RequirePermission permission="payroll.read">
      <Suspense fallback={<PageSkeleton />}>
        <Run params={params} />
      </Suspense>
    </RequirePermission>
  );
}

async function Run({ params }: Pick<PageProps<"/payroll/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const run = await getRun(user.farmId, id);
  if (!run) notFound();
  const showMoney = can(user.role, "expense.read");
  const [expenses, suppliers, items, batches, categories] = showMoney
    ? await Promise.all([
        loadExpenses(user.farmId),
        loadSuppliers(user.farmId),
        loadItems(user.farmId),
        loadBatches(user.farmId),
        loadCategories(user.farmId),
      ])
    : [[], [], [], [], []];
  const mine = new Set(run.lines.map((l) => l.expense?.id).filter(Boolean));
  return (
    <RunDetail
      run={run}
      payslips={expenses.filter((e) => mine.has(e.id))}
      context={{ suppliers, items, categories, batches: batches.map((b) => ({ id: b.id, code: b.code })) }}
      canAdjust={can(user.role, "people.write")}
      canApprove={can(user.role, "payroll.run")}
      canPay={can(user.role, "payout.send")}
      canMarkPaid={can(user.role, "expense.write")}
    />
  );
}
