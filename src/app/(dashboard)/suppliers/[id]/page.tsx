import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SupplierDetail } from "./_components/supplier-detail";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { loadBatches, loadExpenses, loadItems, loadSuppliers } from "@/lib/page-data";

export const metadata: Metadata = { title: "Supplier" };

export default function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  return (
    <RequirePermission permission="supplier.read">
      <Suspense fallback={<PageSkeleton />}>
        <Supplier params={params} />
      </Suspense>
    </RequirePermission>
  );
}

async function Supplier({ params }: Pick<PageProps<"/suppliers/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const [suppliers, expenses, items, batches] = await Promise.all([
    loadSuppliers(user.farmId),
    can(user.role, "expense.read") ? loadExpenses(user.farmId) : Promise.resolve([]),
    loadItems(user.farmId),
    loadBatches(user.farmId),
  ]);
  const supplier = suppliers.find((s) => s.id === id);
  if (!supplier) notFound();
  return (
    <SupplierDetail
      supplier={supplier}
      expenses={expenses.filter((e) => e.supplierId === id)}
      suppliers={suppliers}
      items={items}
      batches={batches.filter((b) => b.phase !== "closed").map((b) => ({ id: b.id, code: b.code }))}
      allBatches={batches.map((b) => ({ id: b.id, code: b.code }))}
      today={today()}
      canEdit={can(user.role, "supplier.write")}
      canWrite={can(user.role, "expense.write")}
      canPay={can(user.role, "payout.send")}
    />
  );
}
