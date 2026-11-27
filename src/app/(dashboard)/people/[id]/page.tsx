import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmployeeDetail } from "./_components/employee-detail";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { loadBatches, loadEmployees } from "@/lib/page-data";
import { listPayslips } from "@/lib/payroll/payslips";
import { listAdvances } from "@/lib/people/advances";

export const metadata: Metadata = { title: "Person" };

export default function PersonPage({ params }: PageProps<"/people/[id]">) {
  return (
    <RequirePermission permission="people.read">
      <Suspense fallback={<PageSkeleton />}>
        <Person params={params} />
      </Suspense>
    </RequirePermission>
  );
}

async function Person({ params }: Pick<PageProps<"/people/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const valid = /^[a-f\d]{24}$/i.test(id);
  const [employees, batches, advances, payslips] = await Promise.all([
    loadEmployees(user.farmId),
    loadBatches(user.farmId),
    listAdvances(user.farmId, valid ? id : undefined),
    valid && can(user.role, "payroll.read") ? listPayslips(user.farmId, id) : [],
  ]);
  const employee = employees.find((e) => e.id === id);
  if (!employee) notFound();
  return (
    <EmployeeDetail
      employee={employee}
      advances={advances}
      payslips={payslips}
      batches={batches
        .filter((b) => b.phase !== "closed" || employee.batchIds.includes(b.id))
        .map((b) => ({ id: b.id, code: b.code }))}
      today={today()}
      canWrite={can(user.role, "people.write")}
      canInvite={can(user.role, "settings.manage")}
    />
  );
}
