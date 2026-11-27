import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BatchDetail } from "./_components/batch-detail";
import { OrdersList } from "../../sales/_components/orders-list";
import { sellable } from "../../sales/_components/sellable";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { listCustomers } from "@/lib/customers/service";
import { listOrders } from "@/lib/sales/service";
import { can } from "@/lib/auth/permissions";
import {
  loadBatch,
  loadBatchCosts,
  loadCategories,
  loadHealth,
  loadHouses,
  loadItems,
  loadLogs,
  loadSuppliers,
  requestToday,
} from "@/lib/page-data";

export const metadata: Metadata = { title: "Batch" };

export default function BatchPage({ params, searchParams }: PageProps<"/batches/[id]">) {
  return (
    <RequirePermission permission="batch.read">
      <Suspense fallback={<PageSkeleton />}>
        <Batch params={params} searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

const TABS = ["overview", "logs", "health", "costs", "sales"] as const;

async function Batch({ params, searchParams }: PageProps<"/batches/[id]">) {
  const user = await requireUser();
  const now = await requestToday();
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const money = can(user.role, "expense.read");
  const seesSales = can(user.role, "sales.read");
  const [batch, houses, logs, health, costs, categories, suppliers, items, orders, customers] = await Promise.all([
    loadBatch(user.farmId, id),
    loadHouses(user.farmId),
    loadLogs(user.farmId, id),
    loadHealth(user.farmId, id),
    money ? loadBatchCosts(user.farmId, id) : Promise.resolve(null),
    money ? loadCategories(user.farmId) : Promise.resolve([]),
    can(user.role, "supplier.read") ? loadSuppliers(user.farmId) : Promise.resolve([]),
    can(user.role, "inventory.read") ? loadItems(user.farmId) : Promise.resolve([]),
    seesSales ? listOrders(user.farmId, { batchId: id }) : Promise.resolve([]),
    seesSales ? listCustomers(user.farmId) : Promise.resolve([]),
  ]);
  if (!batch) notFound();
  return (
    <BatchDetail
      batch={batch}
      houses={houses}
      logs={logs}
      health={health}
      today={now}
      tab={TABS.includes(tab as (typeof TABS)[number]) ? (tab as (typeof TABS)[number]) : "overview"}
      canWrite={can(user.role, "batch.write")}
      canLog={can(user.role, "log.write")}
      canManageHouses={can(user.role, "settings.manage")}
      costs={costs}
      stock={items
        .filter((i) => !i.archived && ["medication", "vaccine", "disinfectant", "other"].includes(i.category))
        .map(({ id, name, unit, onHand }) => ({ id, name, unit, onHand }))}
      categories={categories}
      canSpend={can(user.role, "expense.write")}
      sales={
        seesSales ? (
          <OrdersList
            key="sales"
            orders={orders}
            customers={customers.filter((c) => c.status === "active").map((c) => ({ id: c.id, name: c.name }))}
            batches={sellable([batch])}
            today={now}
            canWrite={can(user.role, "sales.write")}
            title="Sales"
            description={`${batch.totals.sold.toLocaleString("en-NG")} birds sold so far, on orders and in the daily logs.`}
          />
        ) : undefined
      }
      hatcheries={suppliers
        .filter((s) => !s.archived)
        .map((s) => ({ id: s.id, name: s.name, chicks: s.supplies.includes("chicks"), payable: !!s.bank }))}
    />
  );
}
