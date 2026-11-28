import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LowStockCard } from "./_components/low-stock-card";
import { PickupCard } from "./_components/pickup-card";
import { OverviewBoard } from "./_components/overview-board";
import { PageSkeleton } from "./_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can, homeFor } from "@/lib/auth/permissions";
import { overview } from "@/lib/finance/overview";
import { loadBatches, loadItems, requestToday } from "@/lib/page-data";

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
  const now = await requestToday();
  if (!can(user.role, "finance.read")) redirect(homeFor(user.role));
  const [items, batches, data] = await Promise.all([
    loadItems(user.farmId),
    loadBatches(user.farmId),
    overview(user.farmId, now),
  ]);
  const low = items.filter((i) => i.low).sort((a, b) => a.onHand - b.onHand);
  const toPickUp = batches.filter((b) => b.phase === "planned").sort((a, b) => a.placedOn.localeCompare(b.placedOn));
  return (
    <>
      <PageHeader title="Overview" description="Money at a glance, the batches on the farm and what needs attention." />
      <div className="space-y-4">
        <PickupCard batches={toPickUp} today={now} />
        <OverviewBoard data={data} batches={batches.filter((b) => b.phase === "active" || b.phase === "selling")} />
        <LowStockCard items={low} />
      </div>
    </>
  );
}
