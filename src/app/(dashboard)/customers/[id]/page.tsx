import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CustomerDetail } from "./_components/customer-detail";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { getCustomer } from "@/lib/customers/service";
import { readSettings } from "@/lib/settings/service";

export const metadata: Metadata = { title: "Customer" };

export default function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  return (
    <RequirePermission permission="customer.read">
      <Suspense fallback={<PageSkeleton />}>
        <Customer params={params} />
      </Suspense>
    </RequirePermission>
  );
}

async function Customer({ params }: Pick<PageProps<"/customers/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const [customer, settings] = await Promise.all([getCustomer(user.farmId, id), readSettings(user.farmId)]);
  if (!customer) notFound();
  return (
    <CustomerDetail
      customer={customer}
      defaultTermsDays={settings.paymentTermsDays}
      canWrite={can(user.role, "customer.write")}
    />
  );
}
