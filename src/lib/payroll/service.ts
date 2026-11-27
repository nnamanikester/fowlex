import "server-only";

import { Types } from "mongoose";

import {
  type Adjustment,
  daysIn,
  NO_ADJUSTMENT,
  type PayLine,
  type PayState,
  periodEnd,
  periodStart,
  settle,
  totals,
  validateAdjustment,
} from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { today as lagosToday } from "@/lib/dates";
import { connectDb, withTransaction } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { monthName } from "@/lib/people/advance-rules";
import { advanceDeductions } from "@/lib/people/advances";
import { daysWorked } from "@/lib/people/attendance";
import { formatDays } from "@/lib/people/attendance-rules";
import { payExpense } from "@/lib/payouts/service";
import { AdvanceModel } from "@/models/advance";
import { BatchModel } from "@/models/batch";
import { nextSequence } from "@/models/counter";
import { EmployeeModel } from "@/models/employee";
import { ExpenseModel } from "@/models/expense";
import { PayoutModel } from "@/models/payout";
import { PayrollRunModel } from "@/models/payroll-run";

export type PayslipExpense = { id: string; number: string; paymentStatus: string; approval: string };
export type RunLine = PayLine & { id: string; expense: PayslipExpense | null };
export type RunView = {
  id: string;
  version: number;
  number: string;
  period: string;
  status: "draft" | "approved";
  payState: PayState;
  lines: RunLine[];
  totals: ReturnType<typeof totals>;
  approvedAt: string | null;
};

type Employee = {
  _id: Types.ObjectId;
  name: string;
  job?: string;
  payType: PayLine["payType"];
  rateKobo: number;
  startDate: string;
  leftOn?: string | null;
  status: string;
  bank?: unknown;
  batchIds?: Types.ObjectId[];
};
type RunDoc = {
  _id: Types.ObjectId;
  __v?: number;
  number: string;
  period: string;
  status: "draft" | "approved";
  adjustments?: ({ employeeId: Types.ObjectId } & Adjustment)[];
  lines?: (Omit<PayLine, "employeeId" | "advances" | "batchIds"> & {
    _id: Types.ObjectId;
    employeeId: Types.ObjectId;
    advances: { advanceId: Types.ObjectId; amountKobo: number }[];
    batchIds: Types.ObjectId[];
  })[];
  approvedAt?: Date | null;
};

const isId = (id: unknown): id is string => typeof id === "string" && Types.ObjectId.isValid(id);
const short = (d: string) =>
  new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${d}T00:00:00Z`),
  );

/**
 * Everyone's pay for a month, worked out from what's already recorded:
 * - monthly: the salary, a share of it for a month they started or left part-way;
 * - by the day: the days on the attendance sheet (and days they sent in the daily log);
 * - per batch: each of their batches closed that month.
 * Then bonuses and deductions, and what's due on their advances.
 */
async function workOut(farmId: string, period: string, adjustments: Map<string, Adjustment>, runId?: string) {
  const from = periodStart(period);
  const to = periodEnd(period);
  const people = (await EmployeeModel.find({
    farmId,
    startDate: { $lte: to },
    $or: [{ leftOn: null }, { leftOn: { $gte: from } }],
  })
    .collation({ locale: "en" })
    .sort({ name: 1 })
    .lean()) as unknown as Employee[];
  const [days, closed] = await Promise.all([
    daysWorked(farmId, from, to),
    BatchModel.find(
      {
        farmId,
        status: "closed",
        closedOn: { $gte: from, $lte: to },
        _id: { $in: people.flatMap((p) => p.batchIds ?? []) },
      },
      { code: 1 },
    ).lean(),
  ]);
  const lines: PayLine[] = [];
  for (const p of people) {
    const id = String(p._id);
    let units = 0;
    let basis = "";
    let batchIds: string[] = [];
    if (p.payType === "monthly") {
      const first = p.startDate > from ? p.startDate : from;
      const last = p.leftOn && p.leftOn < to ? p.leftOn : to;
      const employed = Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1;
      units = employed / daysIn(period);
      basis =
        units === 1
          ? "Monthly salary"
          : `${p.startDate > from ? `Started ${short(p.startDate)}` : `Left ${short(last)}`}: ${employed} of ${daysIn(period)} days`;
    } else if (p.payType === "daily") {
      units = days.get(id) ?? 0;
      basis = `${formatDays(units)} × ${formatNaira(p.rateKobo)}`;
    } else {
      const mine = closed.filter((b) => (p.batchIds ?? []).some((x) => String(x) === String(b._id)));
      units = mine.length;
      batchIds = mine.map((b) => String(b._id));
      basis = mine.length ? `${mine.map((b) => b.code).join(", ")} closed` : "No batch closed this month";
    }
    const gross = Math.round(units * p.rateKobo);
    const saved = adjustments.get(id) ?? NO_ADJUSTMENT;
    const adjustment: Adjustment = {
      bonusKobo: saved.bonusKobo,
      deductionKobo: saved.deductionKobo,
      deductionNote: saved.deductionNote,
      excluded: saved.excluded,
    };
    const due = await advanceDeductions(farmId, id, period, runId);
    lines.push({
      employeeId: id,
      name: p.name,
      job: p.job ?? "",
      payType: p.payType,
      rateKobo: p.rateKobo,
      units,
      basis,
      grossKobo: gross,
      ...adjustment,
      ...settle(gross, adjustment, due),
      hasBank: !!p.bank,
      batchIds,
    });
  }
  return lines;
}

async function view(farmId: string, run: RunDoc): Promise<RunView> {
  let lines: RunLine[];
  if (run.status === "draft") {
    const adjustments = new Map((run.adjustments ?? []).map((a) => [String(a.employeeId), a]));
    lines = (await workOut(farmId, run.period, adjustments, String(run._id))).map((l) => ({
      ...l,
      id: l.employeeId,
      expense: null,
    }));
  } else {
    const expenses = await ExpenseModel.find(
      { "source.kind": "payslip", "source.id": { $in: (run.lines ?? []).map((l) => l._id) } },
      { number: 1, paymentStatus: 1, approval: 1, source: 1 },
    ).lean();
    const of = new Map(expenses.map((e) => [String(e.source!.id), e]));
    lines = (run.lines ?? []).map((l) => {
      const e = of.get(String(l._id));
      return {
        employeeId: String(l.employeeId),
        name: l.name,
        job: l.job ?? "",
        payType: l.payType,
        rateKobo: l.rateKobo,
        units: l.units,
        basis: l.basis ?? "",
        grossKobo: l.grossKobo,
        bonusKobo: l.bonusKobo,
        deductionKobo: l.deductionKobo,
        deductionNote: l.deductionNote ?? "",
        excluded: l.excluded,
        advances: l.advances.map((a) => ({ advanceId: String(a.advanceId), amountKobo: a.amountKobo })),
        advanceKobo: l.advanceKobo,
        netKobo: l.netKobo,
        hasBank: l.hasBank,
        batchIds: l.batchIds.map(String),
        id: String(l._id),
        expense: e
          ? { id: String(e._id), number: e.number, paymentStatus: e.paymentStatus, approval: e.approval }
          : null,
      };
    });
  }
  const owed = lines.filter((l) => l.expense);
  const paid = owed.filter((l) => l.expense!.paymentStatus === "paid").length;
  return {
    id: String(run._id),
    version: run.__v ?? 0,
    number: run.number,
    period: run.period,
    status: run.status,
    payState: run.status === "draft" ? "draft" : paid === owed.length ? "paid" : paid ? "part-paid" : "to-pay",
    lines,
    totals: totals(lines),
    approvedAt: run.approvedAt ? run.approvedAt.toISOString() : null,
  };
}

/** The farm's payroll runs, newest month first. */
export async function listRuns(farmId: string): Promise<RunView[]> {
  await connectDb();
  const runs = (await PayrollRunModel.find({ farmId }).sort({ period: -1 }).lean()) as unknown as RunDoc[];
  return Promise.all(runs.map((r) => view(farmId, r)));
}

export async function getRun(farmId: string, id: string) {
  await connectDb();
  const run = isId(id)
    ? ((await PayrollRunModel.findOne({ _id: id, farmId }).lean()) as unknown as RunDoc | null)
    : null;
  return run ? view(farmId, run) : null;
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const run = isId(id) ? await PayrollRunModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!run) throw new HttpError(404, "not_found", "That payroll run doesn't exist any more.");
  return run;
}
const stale = () => new HttpError(409, "stale", "Someone changed this payroll while you had it open. Open it again.");
const asDoc = (run: { toObject(): unknown }) => run.toObject() as unknown as RunDoc;

/** Starts working out a month's pay (this month or an earlier one); one run per month. */
export async function startRun(actor: CurrentUser, input: { period?: unknown }, today = lagosToday()) {
  const period = input.period ?? today.slice(0, 7);
  if (typeof period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period > today.slice(0, 7))
    throw new HttpError(400, "invalid_payroll", "Choose this month or an earlier one.", "period");
  await connectDb();
  const existing = await PayrollRunModel.findOne({ farmId: actor.farmId, period }).lean();
  if (existing)
    throw new HttpError(409, "run_exists", `${monthName(period)}'s pay is already started.`, undefined, {
      id: String(existing._id),
    });
  try {
    const run = await PayrollRunModel.create({
      farmId: actor.farmId,
      createdBy: actor.id,
      period,
      number: `PAY-${period}`,
    });
    return view(actor.farmId, asDoc(run));
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new HttpError(409, "run_exists", `${monthName(period)}'s pay is already started.`);
    throw error;
  }
}

/** Sets one person's bonus, deduction, or leaves them out of a run not yet approved. */
export async function adjustLine(
  actor: CurrentUser,
  id: string,
  employeeId: string,
  input: Record<string, unknown>,
  version: unknown,
) {
  const run = await load(actor, id);
  if (run.status !== "draft") throw new HttpError(409, "approved", "This pay is approved. Reopen it to change it.");
  if (typeof version !== "number" || version !== run.__v) throw stale();
  const values = {
    bonusKobo: input.bonusKobo ?? 0,
    deductionKobo: input.deductionKobo ?? 0,
    deductionNote: typeof input.deductionNote === "string" ? input.deductionNote.trim() : (input.deductionNote ?? ""),
    excluded: input.excluded ?? false,
  };
  const errors = validateAdjustment(values);
  const [field] = Object.keys(errors) as (keyof Adjustment)[];
  if (field) throw new HttpError(400, "invalid_payroll", errors[field]!, field);
  const lines = await workOut(actor.farmId, run.period, new Map(), String(run._id));
  if (!isId(employeeId) || !lines.some((l) => l.employeeId === employeeId))
    throw new HttpError(404, "not_found", "That person isn't in this month's pay.");
  run.adjustments = run.adjustments.filter((a) => String(a.employeeId) !== employeeId) as typeof run.adjustments;
  run.adjustments.push({ employeeId: new Types.ObjectId(employeeId), ...(values as Adjustment) });
  try {
    await run.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return view(actor.farmId, asDoc(run));
}

/**
 * Approves a month's pay: each person's pay is frozen into their payslip, with its labour expense
 * to pay (through Paystack to their bank account, or in cash), and what came out for advances is
 * recorded against them. Attendance for the month can't change after.
 */
export async function approveRun(actor: CurrentUser, id: string, version: unknown, today = lagosToday()) {
  const run = await load(actor, id);
  if (run.status !== "draft") throw new HttpError(409, "approved", "This pay is already approved.");
  if (typeof version !== "number" || version !== run.__v) throw stale();
  const adjustments = new Map(run.adjustments.map((a) => [String(a.employeeId), a as unknown as Adjustment]));
  const lines = await workOut(actor.farmId, run.period, adjustments, String(run._id));
  const owed = lines.filter((l) => !l.excluded && l.netKobo > 0);
  if (!owed.length && !lines.some((l) => !l.excluded && l.advanceKobo > 0))
    throw new HttpError(409, "nothing_to_pay", "There's no pay to approve this month.");
  const employees = new Map(
    (
      (await EmployeeModel.find({ _id: { $in: owed.map((l) => l.employeeId) } }).lean()) as unknown as (Employee & {
        bank?: {
          bankCode: string;
          bankName: string;
          accountNumber: string;
          accountName: string;
          recipientCode?: string | null;
        } | null;
      })[]
    ).map((e) => [String(e._id), e]),
  );
  // The month's own cost: dated in it, on its last day if approved after.
  const payDate = today < periodEnd(run.period) ? today : periodEnd(run.period);
  await withTransaction(async (session) => {
    run.$session(session);
    run.set({
      status: "approved",
      approvedBy: actor.id,
      approvedAt: new Date(),
      lines: lines.map((l) => ({
        ...l,
        employeeId: new Types.ObjectId(l.employeeId),
        batchIds: l.batchIds.map((b) => new Types.ObjectId(b)),
      })),
    });
    try {
      await run.save();
    } catch (error) {
      if ((error as { name?: string }).name === "VersionError") throw stale();
      throw error;
    }
    const year = payDate.slice(0, 4);
    for (const line of run.lines) {
      if (line.excluded) continue;
      for (const a of line.advances)
        await AdvanceModel.updateOne(
          { _id: a.advanceId },
          { $push: { repayments: { period: run.period, amountKobo: a.amountKobo, runId: run._id } } },
          { session },
        );
      if (line.netKobo <= 0) continue;
      const bank = employees.get(String(line.employeeId))?.bank;
      const seq = await nextSequence(actor.farmId, `expense:${year}`, session);
      await ExpenseModel.create(
        [
          {
            farmId: actor.farmId,
            createdBy: actor.id,
            number: `EXP-${year}-${String(seq).padStart(4, "0")}`,
            date: payDate,
            category: "labour",
            description: `${monthName(run.period)} pay: ${line.name}`,
            payeeName: line.name,
            payeeBank: bank
              ? {
                  bankCode: bank.bankCode,
                  bankName: bank.bankName,
                  accountNumber: bank.accountNumber,
                  accountName: bank.accountName,
                  recipientCode: bank.recipientCode ?? null,
                }
              : null,
            // A per-batch payslip for one batch is that batch's cost.
            batchId: line.batchIds.length === 1 ? line.batchIds[0] : null,
            amountKobo: line.netKobo,
            method: bank ? "paystack" : "later",
            paymentStatus: "unpaid",
            approval: "approved",
            source: { kind: "payslip", id: line._id },
          },
        ],
        { session },
      );
    }
  });
  return view(actor.farmId, asDoc(run));
}

/** Takes an approved month back to a draft, to fix it. Not once anyone's been paid. */
export async function reopenRun(actor: CurrentUser, id: string) {
  const run = await load(actor, id);
  if (run.status !== "approved") throw new HttpError(409, "draft", "This pay isn't approved yet.");
  const expenses = await ExpenseModel.find({
    "source.kind": "payslip",
    "source.id": { $in: run.lines.map((l) => l._id) },
  });
  if (
    expenses.some((e) => e.paymentStatus !== "unpaid" && e.paymentStatus !== "failed") ||
    (await PayoutModel.exists({
      expenseId: { $in: expenses.map((e) => e._id) },
      status: { $in: ["pending", "otp", "success"] },
    }))
  )
    throw new HttpError(409, "run_paid", "Someone has been paid already, so this month's pay stays as approved.");
  await withTransaction(async (session) => {
    for (const e of expenses) {
      e.$session(session);
      await e.softDelete();
    }
    await AdvanceModel.updateMany({ farmId: actor.farmId }, { $pull: { repayments: { runId: run._id } } }, { session });
    run.$session(session);
    run.set({ status: "draft", lines: [], approvedBy: null, approvedAt: null });
    await run.save();
  });
  return view(actor.farmId, asDoc(run));
}

/** Removes a month's pay that isn't approved yet. */
export async function deleteRun(actor: CurrentUser, id: string) {
  const run = await load(actor, id);
  if (run.status !== "draft") throw new HttpError(409, "approved", "Reopen this pay before removing it.");
  await run.softDelete();
}

/**
 * Sends everyone's pay that's still owed through Paystack, one transfer each. Each result is kept:
 * on its way, waiting for an OTP, or refused (with why). People without a bank account are left to
 * pay in cash.
 */
export async function payRun(actor: CurrentUser, id: string) {
  const run = await load(actor, id);
  if (run.status !== "approved") throw new HttpError(409, "draft", "Approve this pay first.");
  const current = await view(actor.farmId, asDoc(run));
  const results: { name: string; status: "sent" | "otp" | "failed"; message?: string }[] = [];
  for (const line of current.lines) {
    if (!line.expense || !line.hasBank || !["unpaid", "failed"].includes(line.expense.paymentStatus)) continue;
    try {
      const payout = await payExpense(actor, line.expense.id);
      results.push({
        name: line.name,
        status: payout.status === "otp" ? "otp" : payout.status === "failed" ? "failed" : "sent",
        message: payout.failure || undefined,
      });
    } catch (error) {
      results.push({ name: line.name, status: "failed", message: (error as Error).message });
    }
  }
  return { run: await view(actor.farmId, asDoc(await load(actor, id))), results };
}

/** Why a day's attendance can't change: its month's pay is approved. */
export async function attendanceLock(farmId: string, date: string) {
  const period = date.slice(0, 7);
  const run = await PayrollRunModel.exists({ farmId, period, status: "approved" });
  return run ? `${monthName(period)}'s pay is approved, so its attendance stays. Reopen the pay to change it.` : null;
}
