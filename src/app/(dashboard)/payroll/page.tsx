import { Suspense } from "react";
import type { Metadata } from "next";

import { PayrollBoard } from "./_components/payroll-board";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { listRuns } from "@/lib/payroll/service";
import { loadEmployees } from "@/lib/page-data";

export const metadata: Metadata = { title: "Payroll" };

export default function PayrollPage() {
  return (
    <RequirePermission permission="payroll.read">
      <PageHeader title="Payroll" description="Each month's pay, worked out from attendance, batches and advances." />
      <Suspense fallback={<PageSkeleton />}>
        <Payroll />
      </Suspense>
    </RequirePermission>
  );
}

async function Payroll() {
  const user = await requireUser();
  const [runs, employees] = await Promise.all([listRuns(user.farmId), loadEmployees(user.farmId)]);
  return (
    <PayrollBoard
      runs={runs}
      hasPeople={employees.some((e) => e.status === "active")}
      today={today()}
      canStart={can(user.role, "people.write")}
    />
  );
}
