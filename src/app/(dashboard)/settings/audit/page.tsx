import { Suspense } from "react";
import type { Metadata } from "next";

import { AuditTable } from "./_components/audit-table";
import { PageSkeleton } from "../../_components/require-permission";
import { listAudit } from "@/lib/audit/service";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Audit />
    </Suspense>
  );
}

async function Audit() {
  const actor = await requireUser();
  return <AuditTable rows={await listAudit(actor)} />;
}
