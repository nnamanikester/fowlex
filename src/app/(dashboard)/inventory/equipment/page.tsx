import { Suspense } from "react";
import type { Metadata } from "next";

import { EquipmentBoard } from "./_components/equipment-board";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { InventoryTabs } from "../_components/inventory-tabs";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { loadAssets, loadBatches, loadItems, loadSuppliers, loadCategories } from "@/lib/page-data";

export const metadata: Metadata = { title: "Equipment" };

export default function EquipmentPage() {
  return (
    <RequirePermission permission="expense.read">
      <PageHeader title="Inventory" description="Equipment that lasts years, and what it's worth as it wears." />
      <InventoryTabs current="equipment" />
      <Suspense fallback={<PageSkeleton />}>
        <Equipment />
      </Suspense>
    </RequirePermission>
  );
}

async function Equipment() {
  const user = await requireUser();
  const canWrite = can(user.role, "expense.write");
  const [assets, suppliers, items, batches, categories] = await Promise.all([
    loadAssets(user.farmId),
    canWrite ? loadSuppliers(user.farmId) : Promise.resolve([]),
    canWrite ? loadItems(user.farmId) : Promise.resolve([]),
    canWrite ? loadBatches(user.farmId) : Promise.resolve([]),
    loadCategories(user.farmId),
  ]);
  return (
    <EquipmentBoard
      assets={assets}
      today={today()}
      canWrite={canWrite}
      spending={{
        categories,
        suppliers,
        items,
        batches: batches.filter((b) => b.phase !== "closed").map((b) => ({ id: b.id, code: b.code })),
        today: today(),
        canWrite,
        canPay: can(user.role, "payout.send"),
      }}
    />
  );
}
