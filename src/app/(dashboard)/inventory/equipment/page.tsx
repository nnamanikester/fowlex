import { Suspense } from "react";
import type { Metadata } from "next";

import { EquipmentBoard } from "./_components/equipment-board";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { InventoryTabs } from "../_components/inventory-tabs";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { loadAssets } from "@/lib/page-data";

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
  return (
    <EquipmentBoard assets={await loadAssets(user.farmId)} today={today()} canWrite={can(user.role, "expense.write")} />
  );
}
