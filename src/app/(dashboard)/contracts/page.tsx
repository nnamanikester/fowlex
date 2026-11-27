import { Suspense } from "react";
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
  const { open } = await searchParams;
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
        customers={customers.filter((c) => c.status === "active")}
        templates={templates}
        today={now}
        canWrite={canWrite}
        openId={typeof open === "string" ? open : undefined}
      />
      <TemplatesPanel templates={templates} canWrite={canWrite} />
    </div>
  );
}
