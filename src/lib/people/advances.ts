import "server-only";

import { Types } from "mongoose";

import {
  ADVANCE_PAYMENTS,
  type AdvanceInput,
  type AdvancePayment,
  instalment,
  monthName,
  validateAdvance,
} from "./advance-rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { today as lagosToday } from "@/lib/dates";
import { connectDb, withTransaction } from "@/lib/db";
import { readSettings } from "@/lib/settings/service";
import { AdvanceModel } from "@/models/advance";
import { nextSequence } from "@/models/counter";
import { EmployeeModel } from "@/models/employee";
import { ExpenseModel } from "@/models/expense";
import { PayoutModel } from "@/models/payout";
import { PayrollRunModel } from "@/models/payroll-run";

export type AdvanceView = {
  id: string;
  employeeId: string;
  date: string;
  amountKobo: number;
  months: number;
  firstPeriod: string;
  reason: string;
  /** Taken back from pay so far. */
  repaidKobo: number;
  /** Still to come out of pay. */
  balanceKobo: number;
  /** Its labour expense, and whether it's been handed over. */
  expense: { id: string; number: string; paymentStatus: string; method: string } | null;
};

type Doc = {
  _id: unknown;
  employeeId: unknown;
  date: string;
  amountKobo: number;
  months: number;
  firstPeriod: string;
  reason?: string;
  repayments?: { period: string; amountKobo: number; runId: unknown }[];
};

const view = (
  a: Doc,
  expense?: { _id: unknown; number: string; paymentStatus: string; method: string } | null,
): AdvanceView => {
  const repaid = (a.repayments ?? []).reduce((n, r) => n + r.amountKobo, 0);
  return {
    id: String(a._id),
    employeeId: String(a.employeeId),
    date: a.date,
    amountKobo: a.amountKobo,
    months: a.months,
    firstPeriod: a.firstPeriod,
    reason: a.reason ?? "",
    repaidKobo: repaid,
    balanceKobo: a.amountKobo - repaid,
    expense: expense
      ? {
          id: String(expense._id),
          number: expense.number,
          paymentStatus: expense.paymentStatus,
          method: expense.method,
        }
      : null,
  };
};

/** The farm's advances (or one person's), newest first, with what's left to pay back. */
export async function listAdvances(farmId: string, employeeId?: string): Promise<AdvanceView[]> {
  await connectDb();
  const docs = await AdvanceModel.find({ farmId, ...(employeeId ? { employeeId } : {}) })
    .sort({ date: -1, createdAt: -1 })
    .lean();
  const expenses = await ExpenseModel.find(
    { "source.kind": "advance", "source.id": { $in: docs.map((d) => d._id) } },
    { number: 1, paymentStatus: 1, method: 1, source: 1 },
  ).lean();
  const of = new Map(expenses.map((e) => [String(e.source!.id), e]));
  return docs.map((d) => view(d as unknown as Doc, of.get(String(d._id)) as never));
}

/**
 * What comes out of someone's pay for `period`: from each advance due by then, its instalment (or
 * what's left of it), not counting a deduction this run already made.
 */
export async function advanceDeductions(farmId: string, employeeId: string, period: string, runId?: string) {
  const docs = (await AdvanceModel.find({ farmId, employeeId, firstPeriod: { $lte: period } })
    .sort({ date: 1 })
    .lean()) as unknown as Doc[];
  return docs
    .map((a) => {
      const earlier = (a.repayments ?? []).filter((r) => r.period !== period || String(r.runId) !== runId);
      const left = a.amountKobo - earlier.reduce((n, r) => n + r.amountKobo, 0);
      return { advanceId: String(a._id), amountKobo: Math.min(left, instalment(a.amountKobo, a.months)) };
    })
    .filter((d) => d.amountKobo > 0);
}

/**
 * Gives someone an advance: saved with its labour expense, paid already (cash or transfer) or owed
 * and paid through Paystack to their bank account. A manager's big advance waits for an owner.
 */
export async function createAdvance(actor: CurrentUser, input: Record<string, unknown>, today = lagosToday()) {
  const date = input.date === undefined || input.date === "" ? today : input.date;
  const raw = {
    employeeId: input.employeeId,
    date,
    amountKobo: input.amountKobo,
    months: input.months ?? 1,
    firstPeriod: input.firstPeriod ?? (typeof date === "string" ? date.slice(0, 7) : undefined),
    reason: typeof input.reason === "string" ? input.reason.trim() : (input.reason ?? ""),
  };
  const errors = validateAdvance(raw, { today });
  const [field] = Object.keys(errors) as (keyof typeof errors)[];
  if (field) throw new HttpError(400, "invalid_advance", errors[field]!, field);
  const values = raw as AdvanceInput;
  const paidBy = (input.paidBy ?? "cash") as AdvancePayment;
  if (!ADVANCE_PAYMENTS.includes(paidBy))
    throw new HttpError(400, "invalid_advance", "Choose how it was given.", "paidBy");
  await connectDb();
  const employee = await EmployeeModel.findOne({
    _id: values.employeeId,
    farmId: actor.farmId,
    status: "active",
  }).lean();
  if (!employee) throw new HttpError(400, "invalid_advance", "Choose someone working here.", "employeeId");
  if (await PayrollRunModel.exists({ farmId: actor.farmId, period: values.firstPeriod, status: "approved" }))
    throw new HttpError(
      409,
      "pay_approved",
      `${monthName(values.firstPeriod)}'s pay is already approved. Take it from next month's pay.`,
      "firstPeriod",
    );
  if (paidBy === "paystack" && !employee.bank)
    throw new HttpError(409, "no_bank", `Add ${employee.name}'s bank account to pay them through Paystack.`, "paidBy");
  const amount = values.amountKobo;
  const pending =
    !can(actor.role, "expense.approve") && amount > (await readSettings(actor.farmId)).expenseApprovalLimitKobo;
  const paid = paidBy !== "paystack";
  const id = await withTransaction(async (session) => {
    const [advance] = await AdvanceModel.create([{ ...values, farmId: actor.farmId, createdBy: actor.id }], {
      session,
    });
    const year = values.date.slice(0, 4);
    const seq = await nextSequence(actor.farmId, `expense:${year}`, session);
    const bank = employee.bank;
    await ExpenseModel.create(
      [
        {
          farmId: actor.farmId,
          createdBy: actor.id,
          number: `EXP-${year}-${String(seq).padStart(4, "0")}`,
          date: values.date,
          category: "labour",
          description: `Salary advance: ${employee.name}`,
          payeeName: employee.name,
          payeeBank: bank
            ? {
                bankCode: bank.bankCode,
                bankName: bank.bankName,
                accountNumber: bank.accountNumber,
                accountName: bank.accountName,
                recipientCode: bank.recipientCode ?? null,
              }
            : null,
          amountKobo: amount,
          method: paidBy,
          paymentStatus: paid ? "paid" : "unpaid",
          paidOn: paid ? values.date : null,
          approval: pending ? "pending" : "approved",
          source: { kind: "advance", id: advance._id },
        },
      ],
      { session },
    );
    return advance._id;
  });
  return (await listAdvances(actor.farmId)).find((a) => a.id === String(id))!;
}

/** Removes an advance given by mistake, with its expense. Not once pay has taken some back, or it went through Paystack. */
export async function deleteAdvance(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id) ? await AdvanceModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!doc) throw new HttpError(404, "not_found", "That advance doesn't exist any more.");
  if (doc.repayments.length)
    throw new HttpError(
      409,
      "advance_repaid",
      "Some of this has come out of their pay already, so it stays on record.",
    );
  const expense = await ExpenseModel.findOne({ "source.kind": "advance", "source.id": doc._id });
  if (expense && (await PayoutModel.exists({ expenseId: expense._id, status: { $in: ["pending", "otp", "success"] } })))
    throw new HttpError(409, "advance_paid", "This went through Paystack, so it stays on record.");
  await withTransaction(async (session) => {
    doc.$session(session);
    await doc.softDelete();
    if (expense) {
      expense.$session(session);
      await expense.softDelete();
    }
  });
}
