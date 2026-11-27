import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LowStockCard } from "./_components/low-stock-card";
import { PickupCard } from "./_components/pickup-card";
import { Planned } from "./_components/planned";
import { PageSkeleton } from "./_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can, homeFor } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { loadBatches, loadItems } from "@/lib/page-data";

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  // The overview is money; staff land on their daily log instead.
  const user = await requireUser();
  if (!can(user.role, "finance.read")) redirect(homeFor(user.role));
  const [items, batches] = await Promise.all([loadItems(user.farmId), loadBatches(user.farmId)]);
  const low = items.filter((i) => i.low).sort((a, b) => a.onHand - b.onHand);
  const toPickUp = batches.filter((b) => b.phase === "planned").sort((a, b) => a.placedOn.localeCompare(b.placedOn));
  return (
    <Planned
      title="Overview"
      description="Revenue, costs and profit at a glance, the batches on the farm and what needs attention."
      step="8.4"
      permission="finance.read"
    >
      <div className="space-y-4">
        <PickupCard batches={toPickUp} today={today()} />
        <LowStockCard items={low} />
      </div>
    </Planned>
  );
}
