import { Suspense } from "react";
import type { Metadata } from "next";

import { OrdersList } from "./_components/orders-list";
import { SellNow } from "./_components/sell-now";
import { ShopPanel } from "./_components/shop-panel";
import { sellable } from "./_components/sellable";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { listBatches } from "@/lib/batches/service";
import { listCustomers } from "@/lib/customers/service";
import { requestToday } from "@/lib/page-data";
import { listOrders } from "@/lib/sales/service";
import { paystackMode } from "@/lib/paystack/client";
import { sellable as freeBirds, shopSettings } from "@/lib/shop/service";

export const metadata: Metadata = { title: "Sales" };

export default function SalesPage({ searchParams }: PageProps<"/sales">) {
  return (
    <RequirePermission permission="sales.read">
      <PageHeader title="Sales" description="Orders of birds to customers: booked, delivered and invoiced." />
      <Suspense fallback={<PageSkeleton />}>
        <Sales searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

async function Sales({ searchParams }: Pick<PageProps<"/sales">, "searchParams">) {
  const user = await requireUser();
  const now = await requestToday();
  const { open } = await searchParams;
  const [orders, customers, batches, shop, free] = await Promise.all([
    listOrders(user.farmId),
    listCustomers(user.farmId),
    listBatches(user.farmId, now),
    shopSettings(user.farmId),
    freeBirds(user.farmId, now),
  ]);
  const canSell = can(user.role, "sales.write");
  return (
    <div className="space-y-5">
      {canSell && (
        <SellNow
          batches={free.map((b) => ({ id: b.id, code: b.code, free: b.free, birdGrams: b.weightGrams }))}
          prices={shop.prices}
          simulated={paystackMode() === "simulated"}
        />
      )}
      <ShopPanel shop={shop} canWrite={can(user.role, "sales.write")} />
      <OrdersList
        openId={typeof open === "string" ? open : undefined}
        orders={orders}
        customers={customers.filter((c) => c.status === "active").map((c) => ({ id: c.id, name: c.name }))}
        batches={sellable(batches)}
        today={now}
        canWrite={can(user.role, "sales.write")}
        filters
      />
    </div>
  );
}
