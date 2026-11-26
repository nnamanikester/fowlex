import { Suspense } from "react";
import type { Metadata } from "next";

import { InventoryBoard } from "./_components/inventory-board";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { loadItems } from "@/lib/page-data";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <RequirePermission permission="inventory.read">
      <PageHeader title="Inventory" description="Feed, drugs, litter and fuel on hand, and what they cost." />
      <Suspense fallback={<PageSkeleton />}>
        <Inventory />
      </Suspense>
    </RequirePermission>
  );
}

async function Inventory() {
  const user = await requireUser();
  return <InventoryBoard items={await loadItems(user.farmId)} canWrite={can(user.role, "inventory.write")} />;
}
