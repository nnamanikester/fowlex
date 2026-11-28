import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContractDashboardView } from "./_components/contract-dashboard";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { contractDashboard } from "@/lib/contracts/dashboard";
import { listTemplates } from "@/lib/contracts/service";
import { requestToday } from "@/lib/page-data";

export const metadata: Metadata = { title: "Contract" };

/** One contract: the agreement as signed, how both sides are keeping to it, and every change to it. */
export default function ContractPage({ params }: PageProps<"/contracts/[id]">) {
  return (
    <RequirePermission permission="contract.read">
      <Suspense fallback={<PageSkeleton />}>
        <Contract params={params} />
      </Suspense>
    </RequirePermission>
  );
}

async function Contract({ params }: Pick<PageProps<"/contracts/[id]">, "params">) {
  const user = await requireUser();
  const now = await requestToday();
  const { id } = await params;
  const [data, templates] = await Promise.all([contractDashboard(user.farmId, id, now), listTemplates(user.farmId)]);
  if (!data) notFound();
  return (
    <ContractDashboardView
      data={data}
      templates={templates}
      today={now}
      canWrite={can(user.role, "contract.write")}
      canApprove={can(user.role, "contract.approve")}
      seesSales={can(user.role, "sales.read")}
      seesInvoices={can(user.role, "invoice.read")}
    />
  );
}
