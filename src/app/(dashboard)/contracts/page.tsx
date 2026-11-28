import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ContractsList } from "./_components/contracts-list";
import { TemplatesPanel } from "./_components/templates-panel";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { listContracts, listTemplates } from "@/lib/contracts/service";
import { listCustomers } from "@/lib/customers/service";
import { requestToday } from "@/lib/page-data";

export const metadata: Metadata = { title: "Contracts" };

export default function ContractsPage({ searchParams }: PageProps<"/contracts">) {
  return (
    <RequirePermission permission="contract.read">
      <PageHeader
        title="Contracts"
        description="What you agreed with each customer: price, how many birds, how often and for how long."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Contracts searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

async function Contracts({ searchParams }: Pick<PageProps<"/contracts">, "searchParams">) {
  const user = await requireUser();
  const now = await requestToday();
  // Old links (emails, bookmarks) opened a contract on this page: it has its own now.
  const { open } = await searchParams;
  if (typeof open === "string") redirect(`/contracts/${open}`);
  const [contracts, customers, templates] = await Promise.all([
    listContracts(user.farmId, { today: now }),
    listCustomers(user.farmId),
    listTemplates(user.farmId),
  ]);
  const canWrite = can(user.role, "contract.write");
  return (
    <div className="space-y-5">
      <ContractsList
        contracts={contracts}
        customers={customers.filter((c) => c.status === "active" && !c.walkIn)}
        templates={templates}
        today={now}
        canWrite={canWrite}
      />
      <TemplatesPanel templates={templates} canWrite={canWrite} />
    </div>
  );
}
