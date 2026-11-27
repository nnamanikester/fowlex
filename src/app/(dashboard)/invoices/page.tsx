import { Suspense } from "react";
import type { Metadata } from "next";

import { InvoicesList } from "./_components/invoices-list";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { listCustomers } from "@/lib/customers/service";
import { listInvoices } from "@/lib/invoices/service";
import { requestToday } from "@/lib/page-data";
import { readSettings } from "@/lib/settings/service";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  return (
    <RequirePermission permission="invoice.read">
      <PageHeader
        title="Invoices"
        description="Bills for delivered orders: what each customer owes, and when it's due."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Invoices searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

async function Invoices({ searchParams }: Pick<PageProps<"/invoices">, "searchParams">) {
  const user = await requireUser();
  const now = await requestToday();
  const params = await searchParams;
  const [invoices, customers, settings] = await Promise.all([
    listInvoices(user.farmId, { today: now }),
    listCustomers(user.farmId),
    readSettings(user.farmId),
  ]);
  const canWrite = can(user.role, "invoice.write");
  const forCustomer = typeof params.new === "string" ? params.new : undefined;
  const orders = typeof params.orders === "string" ? params.orders.split(",").filter(Boolean) : undefined;
  return (
    <InvoicesList
      invoices={invoices}
      customers={customers
        .filter((c) => c.status === "active")
        .map((c) => ({ id: c.id, name: c.name, email: c.email }))}
      vatRateBps={settings.vatEnabled ? settings.vatRateBps : null}
      today={now}
      canWrite={canWrite}
      canPay={can(user.role, "payment.write")}
      start={canWrite && forCustomer ? { customerId: forCustomer, orderIds: orders } : undefined}
      filters
      fab
    />
  );
}
