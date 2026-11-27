import { Suspense } from "react";
import type { Metadata } from "next";

import { CustomersBoard } from "./_components/customers-board";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { listCustomers } from "@/lib/customers/service";
import { readSettings } from "@/lib/settings/service";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <RequirePermission permission="customer.read">
      <PageHeader
        title="Customers"
        description="Restaurants, lounges and hotels you sell to: how to reach them, and how long they have to pay."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Customers />
      </Suspense>
    </RequirePermission>
  );
}

async function Customers() {
  const user = await requireUser();
  const [customers, settings] = await Promise.all([listCustomers(user.farmId), readSettings(user.farmId)]);
  return (
    <CustomersBoard
      customers={customers}
      defaultTermsDays={settings.paymentTermsDays}
      canWrite={can(user.role, "customer.write")}
    />
  );
}
