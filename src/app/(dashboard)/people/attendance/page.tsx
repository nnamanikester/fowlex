import { Suspense } from "react";
import type { Metadata } from "next";

import { AttendanceSheet } from "../_components/attendance-sheet";
import { PeopleTabs } from "../_components/people-tabs";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { isISODate, today as lagosToday } from "@/lib/dates";
import { attendanceDay, daysWorked } from "@/lib/people/attendance";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage({ searchParams }: PageProps<"/people/attendance">) {
  return (
    <RequirePermission permission="people.read">
      <PageHeader title="People" description="Who came to work each day, for those paid by the day." />
      <PeopleTabs current="attendance" />
      <Suspense fallback={<PageSkeleton />}>
        <Sheet searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

async function Sheet({ searchParams }: Pick<PageProps<"/people/attendance">, "searchParams">) {
  const user = await requireUser();
  const today = lagosToday();
  const { date: asked } = await searchParams;
  const date = typeof asked === "string" && isISODate(asked) && asked <= today ? asked : today;
  const [rows, month] = await Promise.all([
    attendanceDay(user.farmId, date),
    daysWorked(user.farmId, `${date.slice(0, 7)}-01`, date),
  ]);
  return (
    <AttendanceSheet
      key={date}
      date={date}
      today={today}
      rows={rows}
      month={Object.fromEntries(month)}
      canWrite={can(user.role, "people.write")}
    />
  );
}
