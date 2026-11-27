import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ItemDetail } from "./_components/item-detail";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { loadBatches, loadCategories, loadItems, loadMovements, loadSuppliers, requestToday } from "@/lib/page-data";

export const metadata: Metadata = { title: "Stock item" };

export default function ItemPage({ params, searchParams }: PageProps<"/inventory/[id]">) {
  return (
    <RequirePermission permission="inventory.read">
      <Suspense fallback={<PageSkeleton />}>
        <Item params={params} searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

async function Item({ params, searchParams }: PageProps<"/inventory/[id]">) {
  const user = await requireUser();
  const now = await requestToday();
  const [{ id }, { buy }] = await Promise.all([params, searchParams]);
  const canBuy = can(user.role, "expense.write");
  const [items, movements, batches, suppliers, categories] = await Promise.all([
    loadItems(user.farmId),
    loadMovements(user.farmId, id),
    loadBatches(user.farmId),
    canBuy ? loadSuppliers(user.farmId) : Promise.resolve([]),
    loadCategories(user.farmId),
  ]);
  const item = items.find((i) => i.id === id);
  if (!item) notFound();
  return (
    <ItemDetail
      item={item}
      movements={movements}
      batches={batches
        .filter((b) => b.phase === "active" || b.phase === "selling")
        .map((b) => ({ id: b.id, code: b.code }))}
      allBatches={Object.fromEntries(batches.map((b) => [b.id, b.code]))}
      today={now}
      canWrite={can(user.role, "inventory.write")}
      showMoney={can(user.role, "expense.read")}
      buyNow={buy === "1" && canBuy}
      spending={
        canBuy
          ? {
              categories,
              suppliers,
              items,
              batches: batches.filter((b) => b.phase !== "closed").map((b) => ({ id: b.id, code: b.code })),
              today: now,
              canWrite: true,
              canPay: can(user.role, "payout.send"),
            }
          : null
      }
    />
  );
}
