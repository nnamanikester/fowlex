import { Suspense } from "react";
import type { Metadata } from "next";

import { InventoryBoard } from "./_components/inventory-board";
import { InventoryTabs } from "./_components/inventory-tabs";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { loadBatches, loadItems, loadSuppliers } from "@/lib/page-data";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <RequirePermission permission="inventory.read">
      <PageHeader title="Inventory" description="Feed, drugs, litter and fuel on hand, and what they cost." />
      <Suspense fallback={null}>
        <Tabs />
      </Suspense>
      <Suspense fallback={<PageSkeleton />}>
        <Inventory />
      </Suspense>
    </RequirePermission>
  );
}

/** Equipment is money: only for those who see it. */
async function Tabs() {
  const user = await requireUser();
  return can(user.role, "expense.read") ? <InventoryTabs current="stock" /> : null;
}

async function Inventory() {
  const user = await requireUser();
  const canBuy = can(user.role, "expense.write");
  const [items, suppliers, batches] = await Promise.all([
    loadItems(user.farmId),
    canBuy ? loadSuppliers(user.farmId) : Promise.resolve([]),
    canBuy ? loadBatches(user.farmId) : Promise.resolve([]),
  ]);
  return (
    <InventoryBoard
      items={items}
      canWrite={can(user.role, "inventory.write")}
      showMoney={can(user.role, "expense.read")}
      spending={
        canBuy
          ? {
              suppliers,
              items,
              batches: batches.filter((b) => b.phase !== "closed").map((b) => ({ id: b.id, code: b.code })),
              today: today(),
              canWrite: true,
              canPay: can(user.role, "payout.send"),
            }
          : null
      }
    />
  );
}
