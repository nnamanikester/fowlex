import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CustomerDetail } from "./_components/customer-detail";
import { ContractsList } from "../../contracts/_components/contracts-list";
import { OrdersList } from "../../sales/_components/orders-list";
import { sellable } from "../../sales/_components/sellable";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { listContracts, listTemplates } from "@/lib/contracts/service";
import { getCustomer } from "@/lib/customers/service";
import { listBatches } from "@/lib/batches/service";
import { requestToday } from "@/lib/page-data";
import { listOrders } from "@/lib/sales/service";
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
  const now = await requestToday();
  const { id } = await params;
  const seesContracts = can(user.role, "contract.read");
  const seesSales = can(user.role, "sales.read");
  const [customer, settings, contracts, templates, orders, batches] = await Promise.all([
    getCustomer(user.farmId, id),
    readSettings(user.farmId),
    seesContracts ? listContracts(user.farmId, { customerId: id, today: now }) : [],
    seesContracts ? listTemplates(user.farmId) : [],
    seesSales ? listOrders(user.farmId, { customerId: id }) : [],
    seesSales ? listBatches(user.farmId, now) : [],
  ]);
  if (!customer) notFound();
  return (
    <CustomerDetail
      customer={customer}
      defaultTermsDays={settings.paymentTermsDays}
      canWrite={can(user.role, "customer.write")}
    >
      {seesSales && (
        <OrdersList
          orders={orders}
          customers={customer.status === "active" ? [{ id: customer.id, name: customer.name }] : []}
          customerId={customer.id}
          batches={sellable(batches)}
          today={now}
          canWrite={can(user.role, "sales.write")}
          showCustomer={false}
        />
      )}
      {seesContracts && (
        <ContractsList
          contracts={contracts}
          customers={customer.status === "active" ? [customer] : []}
          customerId={customer.id}
          templates={templates}
          today={now}
          canWrite={can(user.role, "contract.write")}
          showCustomer={false}
          description="While one runs, their orders use its price."
        />
      )}
    </CustomerDetail>
  );
}
