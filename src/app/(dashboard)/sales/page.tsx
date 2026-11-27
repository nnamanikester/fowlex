import { Suspense } from "react";
import type { Metadata } from "next";

import { OrdersList } from "./_components/orders-list";
import { sellable } from "./_components/sellable";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { listBatches } from "@/lib/batches/service";
import { listCustomers } from "@/lib/customers/service";
import { requestToday } from "@/lib/page-data";
import { listOrders } from "@/lib/sales/service";

export const metadata: Metadata = { title: "Sales" };

export default function SalesPage() {
  return (
    <RequirePermission permission="sales.read">
      <PageHeader title="Sales" description="Orders of birds to customers: booked, delivered and invoiced." />
      <Suspense fallback={<PageSkeleton />}>
        <Sales />
      </Suspense>
    </RequirePermission>
  );
}

async function Sales() {
  const user = await requireUser();
  const now = await requestToday();
  const [orders, customers, batches] = await Promise.all([
    listOrders(user.farmId),
    listCustomers(user.farmId),
    listBatches(user.farmId, now),
  ]);
  return (
    <OrdersList
      orders={orders}
      customers={customers.filter((c) => c.status === "active").map((c) => ({ id: c.id, name: c.name }))}
      batches={sellable(batches)}
      today={now}
      canWrite={can(user.role, "sales.write")}
      filters
      fab
    />
  );
}
