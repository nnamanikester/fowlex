import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { attendanceLock } from "@/lib/payroll/service";
import { attendanceDay, saveAttendance } from "@/lib/people/attendance";

/** A day's attendance sheet (`?date=`). */
export const GET = apiRoute(async (request: Request) => {
  const actor = await requirePermission("people.read");
  return NextResponse.json(await attendanceDay(actor.farmId, new URL(request.url).searchParams.get("date") ?? ""));
});

/** Saves a day's attendance: `{ date, entries: [{ employeeId, status }] }`. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("people.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await saveAttendance(actor, body, undefined, attendanceLock));
});
