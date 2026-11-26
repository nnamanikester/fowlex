import { Suspense } from "react";
import type { Metadata } from "next";

import { SuppliersBoard } from "./_components/suppliers-board";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { loadSuppliers } from "@/lib/page-data";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage() {
  return (
    <RequirePermission permission="supplier.read">
      <PageHeader title="Suppliers" description="Who you buy chicks, feed and drugs from, and who you pay." />
      <Suspense fallback={<PageSkeleton />}>
        <Suppliers />
      </Suspense>
    </RequirePermission>
  );
}

async function Suppliers() {
  const user = await requireUser();
  return <SuppliersBoard suppliers={await loadSuppliers(user.farmId)} canWrite={can(user.role, "supplier.write")} />;
}
