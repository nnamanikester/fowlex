import "server-only";

import { type ClientSession, Types } from "mongoose";

import { dueDates, nextMonthly, onDay, periodOf } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { today as lagosToday } from "@/lib/dates";
import { connectDb, withTransaction } from "@/lib/db";
import { nextSequence } from "@/models/counter";
import { ExpenseModel } from "@/models/expense";
import { RecurringExpenseModel } from "@/models/recurring-expense";

export type RecurringView = {
  id: string;
  version: number;
  category: string;
  description: string;
  amountKobo: number;
  supplierId: string | null;
  payeeName: string;
  dayOfMonth: number;
  nextDue: string;
  active: boolean;
};

type Doc = Omit<RecurringView, "id" | "version" | "supplierId"> & { _id: unknown; __v?: number; supplierId?: unknown };
const view = (r: Doc): RecurringView => ({
  id: String(r._id),
  version: r.__v ?? 0,
  category: r.category,
  description: r.description,
  amountKobo: r.amountKobo,
  supplierId: r.supplierId ? String(r.supplierId) : null,
  payeeName: r.payeeName ?? "",
  dayOfMonth: r.dayOfMonth,
  nextDue: r.nextDue,
  active: r.active,
});

/** The farm's monthly repeats: active ones first, soonest due first. */
export async function listRecurring(farmId: string) {
  await connectDb();
  const docs = await RecurringExpenseModel.find({ farmId }).sort({ active: -1, nextDue: 1 }).lean();
  return docs.map((d) => view(d as unknown as Doc));
}

/**
 * Makes an expense repeat monthly, from the one just recorded (inside its transaction): due on the
 * same day each month, starting next month. The expense becomes this month's occurrence.
 */
export async function repeatMonthly(
  session: ClientSession,
  actor: CurrentUser,
  expense: {
    _id: Types.ObjectId;
    date: string;
    category: string;
    description: string;
    amountKobo: number;
    supplierId?: unknown;
    payeeName?: string;
  },
) {
  const day = Number(expense.date.slice(8, 10));
  const [template] = await RecurringExpenseModel.create(
    [
      {
        farmId: actor.farmId,
        createdBy: actor.id,
        category: expense.category,
        description: expense.description,
        amountKobo: expense.amountKobo,
        supplierId: (expense.supplierId as Types.ObjectId | null | undefined) ?? null,
        payeeName: expense.payeeName ?? "",
        dayOfMonth: day,
        nextDue: nextMonthly(expense.date, day),
        lastMadeOn: expense.date,
      },
    ],
    { session },
  );
  await ExpenseModel.updateOne(
    { _id: expense._id },
    { $set: { recurringId: template._id, period: periodOf(expense.date) } },
    { session },
  );
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id)
    ? await RecurringExpenseModel.findOne({ _id: id, farmId: actor.farmId })
    : null;
  if (!doc) throw new HttpError(404, "not_found", "That repeat doesn't exist any more.");
  return doc;
}

/**
 * Changes a repeat's amount or day, stops it, or starts it again. A new day moves the next date to
 * that day (this month if it's still ahead, else next month).
 */
export async function updateRecurring(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  today = lagosToday(),
) {
  const doc = await load(actor, id);
  const amount = input.amountKobo ?? doc.amountKobo;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > 100_000_000_000)
    throw new HttpError(400, "invalid_recurring", "Enter the monthly amount.", "amountKobo");
  const day = input.dayOfMonth ?? doc.dayOfMonth;
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31)
    throw new HttpError(400, "invalid_recurring", "Choose a day from 1 to 31.", "dayOfMonth");
  const active = typeof input.active === "boolean" ? input.active : doc.active;
  let nextDue = doc.nextDue;
  if (day !== doc.dayOfMonth || (active && !doc.active)) {
    // That day this month; next month's if this month's has already been made. A day already past
    // this month is made on the next run. Months it was stopped for aren't made.
    nextDue = onDay(periodOf(today), day);
    if (doc.lastMadeOn && periodOf(doc.lastMadeOn) >= periodOf(today)) nextDue = nextMonthly(nextDue, day);
  }
  doc.set({ amountKobo: amount, dayOfMonth: day, active, nextDue });
  await doc.save();
  return view(doc.toObject() as unknown as Doc);
}

/**
 * The daily job: makes each repeat's expenses that have come due, one per month, catching up after
 * days it didn't run. Each is waiting for an owner's approval and owed until paid. A month already
 * made (the job run twice, or two servers) is skipped. Returns how many were made.
 */
export async function runRecurring(today = lagosToday()) {
  await connectDb();
  let made = 0;
  for (const r of await RecurringExpenseModel.find({ active: true, nextDue: { $lte: today } }).lean()) {
    const dates = dueDates(r.nextDue, r.dayOfMonth, today);
    for (const date of dates) {
      try {
        await withTransaction(async (session) => {
          const year = date.slice(0, 4);
          const seq = await nextSequence(String(r.farmId), `expense:${year}`, session);
          await ExpenseModel.create(
            [
              {
                farmId: r.farmId,
                createdBy: r.createdBy,
                number: `EXP-${year}-${String(seq).padStart(4, "0")}`,
                date,
                category: r.category,
                description: r.description,
                supplierId: r.supplierId,
                payeeName: r.payeeName,
                amountKobo: r.amountKobo,
                method: "later",
                paymentStatus: "unpaid",
                approval: "pending",
                recurringId: r._id,
                period: periodOf(date),
              },
            ],
            { session },
          );
        });
        made++;
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
    const last = dates.at(-1)!;
    await RecurringExpenseModel.updateOne(
      { _id: r._id, nextDue: r.nextDue },
      { $set: { nextDue: nextMonthly(last, r.dayOfMonth), lastMadeOn: last } },
    );
  }
  return made;
}
