import { Suspense } from "react";
import type { Metadata } from "next";

import { PeopleBoard } from "./_components/people-board";
import { PeopleTabs } from "./_components/people-tabs";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { loadBatches, loadEmployees } from "@/lib/page-data";
import { listAdvances } from "@/lib/people/advances";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <RequirePermission permission="people.read">
      <PageHeader title="People" description="Who works on the farm, how they're paid, and their bank accounts." />
      <PeopleTabs current="people" />
      <Suspense fallback={<PageSkeleton />}>
        <People />
      </Suspense>
    </RequirePermission>
  );
}

async function People() {
  const user = await requireUser();
  const [employees, batches, advances] = await Promise.all([
    loadEmployees(user.farmId),
    loadBatches(user.farmId),
    listAdvances(user.farmId),
  ]);
  const owing: Record<string, number> = {};
  for (const a of advances) owing[a.employeeId] = (owing[a.employeeId] ?? 0) + a.balanceKobo;
  return (
    <PeopleBoard
      employees={employees}
      owing={owing}
      batches={batches.filter((b) => b.phase !== "closed").map((b) => ({ id: b.id, code: b.code }))}
      today={today()}
      canWrite={can(user.role, "people.write")}
      canInvite={can(user.role, "settings.manage")}
    />
  );
}
