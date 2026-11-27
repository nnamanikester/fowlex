import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LowStockCard } from "./_components/low-stock-card";
import { Planned } from "./_components/planned";
import { PageSkeleton } from "./_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can, homeFor } from "@/lib/auth/permissions";
import { loadItems } from "@/lib/page-data";

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
  const low = (await loadItems(user.farmId)).filter((i) => i.low).sort((a, b) => a.onHand - b.onHand);
  return (
    <Planned
      title="Overview"
      description="Revenue, costs and profit at a glance, the batches on the farm and what needs attention."
      step="8.4"
      permission="finance.read"
    >
      <LowStockCard items={low} />
    </Planned>
  );
}
