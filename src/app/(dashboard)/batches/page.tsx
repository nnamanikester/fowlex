import { Suspense } from "react";
import type { Metadata } from "next";

import { BatchesBoard } from "./_components/batches-board";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { loadBatches, loadHouses, loadSuppliers } from "@/lib/page-data";

export const metadata: Metadata = { title: "Batches" };

export default function BatchesPage() {
  return (
    <RequirePermission permission="batch.read">
      <PageHeader title="Batches" description="Every group of chicks from placement to sale." />
      <Suspense fallback={<PageSkeleton />}>
        <Batches />
      </Suspense>
    </RequirePermission>
  );
}

async function Batches() {
  const user = await requireUser();
  const [batches, houses, suppliers] = await Promise.all([
    loadBatches(user.farmId),
    loadHouses(user.farmId),
    can(user.role, "supplier.read") ? loadSuppliers(user.farmId) : Promise.resolve([]),
  ]);
  return (
    <BatchesBoard
      batches={batches}
      houses={houses}
      today={today()}
      canWrite={can(user.role, "batch.write")}
      canManageHouses={can(user.role, "settings.manage")}
      hatcheries={suppliers
        .filter((s) => !s.archived)
        .map((s) => ({ id: s.id, name: s.name, chicks: s.supplies.includes("chicks"), payable: !!s.bank }))}
      canPay={can(user.role, "payout.send")}
    />
  );
}
