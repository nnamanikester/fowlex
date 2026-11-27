import "server-only";

import { Types } from "mongoose";

import { ATTENDANCE, type Attendance, DAY_SHARE } from "./attendance-rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { isISODate, today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { AttendanceModel } from "@/models/attendance";
import { DailyLogModel } from "@/models/daily-log";
import { EmployeeModel } from "@/models/employee";
import { UserModel } from "@/models/user";

export type AttendanceRow = {
  employeeId: string;
  name: string;
  job: string;
  rateKobo: number;
  /** As marked; `null` if not marked yet. */
  status: Attendance | null;
  /** They sent in a daily log that day, so they came unless marked otherwise. */
  logged: boolean;
};

type Worker = {
  _id: Types.ObjectId;
  name: string;
  job?: string;
  rateKobo: number;
  email?: string;
  startDate: string;
  leftOn?: string | null;
};

/** People paid by the day who worked here at some point from `from` to `to`. */
async function dailyWorkers(farmId: string, from: string, to: string) {
  return (await EmployeeModel.find({
    farmId,
    payType: "daily",
    startDate: { $lte: to },
    $or: [{ leftOn: null }, { leftOn: { $gte: from } }],
  })
    .collation({ locale: "en" })
    .sort({ name: 1 })
    .lean()) as unknown as Worker[];
}

const employed = (w: Worker, date: string) => w.startDate <= date && (!w.leftOn || w.leftOn >= date);

/** The days each worker sent in a daily log (as a Fowlex user with their email), from `from` to `to`. */
async function loggedDays(farmId: string, workers: Worker[], from: string, to: string) {
  const emails = workers.map((w) => w.email).filter((e): e is string => !!e);
  const days = new Map<string, Set<string>>();
  if (!emails.length) return days;
  const users = await UserModel.find({ farmId, email: { $in: emails } }, { email: 1 }).lean();
  const byUser = new Map(users.map((u) => [String(u._id), workers.find((w) => w.email === u.email)!]));
  const logs = await DailyLogModel.find(
    { farmId, createdBy: { $in: [...byUser.keys()] }, date: { $gte: from, $lte: to } },
    { createdBy: 1, date: 1 },
  ).lean();
  for (const log of logs) {
    const id = String(byUser.get(String(log.createdBy))!._id);
    if (!days.has(id)) days.set(id, new Set());
    days.get(id)!.add(log.date);
  }
  return days;
}

/** A day's attendance sheet: everyone paid by the day who worked here then. */
export async function attendanceDay(farmId: string, date: string): Promise<AttendanceRow[]> {
  await connectDb();
  if (!isISODate(date)) return [];
  const workers = (await dailyWorkers(farmId, date, date)).filter((w) => employed(w, date));
  const [marks, logged] = await Promise.all([
    AttendanceModel.find({ farmId, date, employeeId: { $in: workers.map((w) => w._id) } }).lean(),
    loggedDays(farmId, workers, date, date),
  ]);
  const status = new Map(marks.map((m) => [String(m.employeeId), (m.status ?? null) as Attendance | null]));
  return workers.map((w) => ({
    employeeId: String(w._id),
    name: w.name,
    job: w.job ?? "",
    rateKobo: w.rateKobo,
    status: status.get(String(w._id)) ?? null,
    logged: logged.get(String(w._id))?.has(date) ?? false,
  }));
}

/**
 * How many days each person paid by the day worked from `from` to `to`: marked days (a half day is
 * half), and days they sent in a daily log that weren't marked.
 */
export async function daysWorked(farmId: string, from: string, to: string): Promise<Map<string, number>> {
  await connectDb();
  const workers = await dailyWorkers(farmId, from, to);
  const [marks, logged] = await Promise.all([
    AttendanceModel.find({
      farmId,
      date: { $gte: from, $lte: to },
      employeeId: { $in: workers.map((w) => w._id) },
    }).lean(),
    loggedDays(farmId, workers, from, to),
  ]);
  const days = new Map<string, number>(workers.map((w) => [String(w._id), 0]));
  const marked = new Map<string, Set<string>>();
  for (const m of marks) {
    const id = String(m.employeeId);
    if (!m.status) continue;
    if (!marked.has(id)) marked.set(id, new Set());
    marked.get(id)!.add(m.date);
    days.set(id, days.get(id)! + DAY_SHARE[m.status as Attendance]);
  }
  for (const [id, dates] of logged)
    for (const date of dates) if (!marked.get(id)?.has(date)) days.set(id, days.get(id)! + 1);
  return days;
}

/**
 * Saves a day's attendance: each entry marks someone as came, half day or absent (`null` clears it).
 * `locked(date)` refuses a day whose pay has already been worked out.
 */
export async function saveAttendance(
  actor: CurrentUser,
  input: { date?: unknown; entries?: unknown },
  today = lagosToday(),
  locked: (farmId: string, date: string) => Promise<string | null> = async () => null,
) {
  const date = input.date;
  if (typeof date !== "string" || !isISODate(date))
    throw new HttpError(400, "invalid_attendance", "Choose a day.", "date");
  if (date > today) throw new HttpError(400, "invalid_attendance", "That day hasn't come yet.", "date");
  const entries = Array.isArray(input.entries) ? (input.entries as { employeeId?: unknown; status?: unknown }[]) : null;
  if (
    !entries?.length ||
    entries.some(
      (e) =>
        typeof e?.employeeId !== "string" ||
        !Types.ObjectId.isValid(e.employeeId) ||
        (e.status !== null && !ATTENDANCE.includes(e.status as Attendance)),
    )
  )
    throw new HttpError(400, "invalid_attendance", "Mark who came, then save.", "entries");
  await connectDb();
  const why = await locked(actor.farmId, date);
  if (why) throw new HttpError(409, "attendance_locked", why);
  const ids = [...new Set(entries.map((e) => e.employeeId as string))];
  const workers = (await EmployeeModel.find({
    farmId: actor.farmId,
    _id: { $in: ids },
    payType: "daily",
  }).lean()) as unknown as Worker[];
  const off = ids.find((id) => {
    const w = workers.find((x) => String(x._id) === id);
    return !w || !employed(w, date);
  });
  if (off)
    throw new HttpError(
      400,
      "invalid_attendance",
      "Someone on the sheet didn't work here that day. Open the day again.",
      "entries",
    );
  for (const e of entries)
    await AttendanceModel.updateOne(
      { farmId: new Types.ObjectId(actor.farmId), employeeId: new Types.ObjectId(e.employeeId as string), date },
      { $set: { status: (e.status ?? null) as Attendance }, $setOnInsert: { createdBy: new Types.ObjectId(actor.id) } },
      { upsert: true },
    );
  return attendanceDay(actor.farmId, date);
}
