import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Planned } from "./_components/planned";
import { PageSkeleton } from "./_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can, homeFor } from "@/lib/auth/permissions";

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
  return (
    <Planned
      title="Overview"
      description="Revenue, costs and profit at a glance, the batches on the farm and what needs attention."
      step="8.4"
      permission="finance.read"
    />
  );
}
