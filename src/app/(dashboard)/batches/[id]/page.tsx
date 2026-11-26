import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BatchDetail } from "./_components/batch-detail";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { loadBatch, loadHouses } from "@/lib/page-data";

export const metadata: Metadata = { title: "Batch" };

export default function BatchPage({ params, searchParams }: PageProps<"/batches/[id]">) {
  return (
    <RequirePermission permission="batch.read">
      <Suspense fallback={<PageSkeleton />}>
        <Batch params={params} searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

const TABS = ["overview", "logs", "health", "costs", "sales"] as const;

async function Batch({ params, searchParams }: PageProps<"/batches/[id]">) {
  const user = await requireUser();
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const [batch, houses] = await Promise.all([loadBatch(user.farmId, id), loadHouses(user.farmId)]);
  if (!batch) notFound();
  return (
    <BatchDetail
      batch={batch}
      houses={houses}
      today={today()}
      tab={TABS.includes(tab as (typeof TABS)[number]) ? (tab as (typeof TABS)[number]) : "overview"}
      canWrite={can(user.role, "batch.write")}
      canManageHouses={can(user.role, "settings.manage")}
    />
  );
}
