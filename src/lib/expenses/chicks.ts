import "server-only";

import { type ClientSession, Types } from "mongoose";

import { paidCount } from "@/lib/batches/rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { readSettings } from "@/lib/settings/service";
import { nextSequence } from "@/models/counter";
import { ExpenseModel } from "@/models/expense";
import { PayoutModel } from "@/models/payout";
import { SupplierModel } from "@/models/supplier";

/** How a batch's chicks were paid for when it's placed: already (cash, transfer, POS), or owed. */
export const CHICK_PAYMENTS = ["transfer", "cash", "pos", "later"] as const;
export type ChickPayment = (typeof CHICK_PAYMENTS)[number];

type Batch = {
  _id: Types.ObjectId;
  bookedChicks?: number | null;
  code: string;
  placedOn: string;
  delivered: number;
  freeExtras: number;
  pricePerChickKobo: number;
  supplierId?: Types.ObjectId | string | null;
  supplierName?: string;
};

const cost = (b: Batch) => paidCount(b) * b.pricePerChickKobo;
const describe = (b: Batch) =>
  `${paidCount(b).toLocaleString("en-NG")} day-old chicks for ${b.code}` +
  (b.freeExtras ? ` (+${b.freeExtras.toLocaleString("en-NG")} free)` : "");
// Chicks are often paid for before they arrive: never a day in the future.
const dayOf = (b: Batch, today: string) => (b.placedOn > today ? today : b.placedOn);

/** The hatchery a batch names: a saved supplier on the farm (its name used), or a name typed in. */
export async function resolveHatchery(farmId: string, values: { supplierId?: string | null; supplierName: string }) {
  if (!values.supplierId) return { supplierId: null, supplierName: values.supplierName };
  const supplier = await SupplierModel.findOne({ _id: values.supplierId, farmId }, { name: 1 }).lean();
  if (!supplier) throw new HttpError(400, "invalid_batch", "Choose a hatchery on the farm.", "supplierId");
  return { supplierId: String(supplier._id), supplierName: supplier.name };
}

/** Would recording these chicks wait for an owner? Same rule as any expense (4.3). */
export async function chicksNeedApproval(
  actor: CurrentUser,
  b: Pick<Batch, "delivered" | "freeExtras" | "pricePerChickKobo">,
) {
  if (can(actor.role, "expense.approve")) return false;
  return paidCount(b) * b.pricePerChickKobo > (await readSettings(actor.farmId)).expenseApprovalLimitKobo;
}

/**
 * Records a batch's chicks as a chicks expense charged to it, in the batch's transaction: the
 * hatchery, the cost of the chicks paid for, and how they were paid. Nothing for free chicks.
 */
export async function recordChicks(
  session: ClientSession,
  actor: CurrentUser,
  batch: Batch,
  { paidBy, pending, today }: { paidBy: ChickPayment; pending: boolean; today: string },
) {
  if (cost(batch) <= 0) return;
  const date = dayOf(batch, today);
  const year = date.slice(0, 4);
  const seq = await nextSequence(actor.farmId, `expense:${year}`, session);
  const paid = paidBy !== "later";
  await ExpenseModel.create(
    [
      {
        farmId: actor.farmId,
        createdBy: actor.id,
        number: `EXP-${year}-${String(seq).padStart(4, "0")}`,
        date,
        category: "chicks",
        description: describe(batch),
        supplierId: batch.supplierId || null,
        payeeName: batch.supplierId ? "" : (batch.supplierName ?? ""),
        batchId: batch._id,
        amountKobo: cost(batch),
        method: paidBy,
        paymentStatus: paid ? "paid" : "unpaid",
        paidOn: paid ? date : null,
        approval: pending ? "pending" : "approved",
        source: { kind: "batch", id: batch._id },
      },
    ],
    { session },
  );
}

/** A batch's chicks expense, if it has one. */
export const chickExpenseOf = (batchId: Types.ObjectId | string, session?: ClientSession) =>
  ExpenseModel.findOne({ "source.kind": "batch", "source.id": new Types.ObjectId(String(batchId)) }).session(
    session ?? null,
  );

/** True when money for these chicks went (or is going) through Paystack: then it can't change. */
async function sentThroughPaystack(expenseId: Types.ObjectId) {
  return !!(await PayoutModel.exists({ expenseId, status: { $in: ["pending", "otp", "success"] } }));
}

/**
 * Keeps a batch's chicks expense in step when the batch changes (count, price, hatchery, day).
 * Refused if the money already went through Paystack and the cost or hatchery would change: record
 * the difference as its own expense instead.
 */
export async function syncChicks(session: ClientSession, batch: Batch, today: string) {
  const expense = await chickExpenseOf(batch._id, session);
  if (!expense) return;
  const changes = {
    // Money already paid keeps the day it was paid (a booking paid ahead of pickup).
    date: expense.paymentStatus === "paid" ? expense.date : dayOf(batch, today),
    description: describe(batch),
    amountKobo: cost(batch),
    supplierId: batch.supplierId ? new Types.ObjectId(String(batch.supplierId)) : null,
    payeeName: batch.supplierId ? "" : (batch.supplierName ?? ""),
  };
  const moneyChanged =
    changes.amountKobo !== expense.amountKobo || String(changes.supplierId ?? "") !== String(expense.supplierId ?? "");
  if (moneyChanged && (await sentThroughPaystack(expense._id)))
    throw new HttpError(
      409,
      "chicks_paid",
      `${batch.code}'s chicks were paid through Paystack, so their cost and hatchery stay. Record any difference as its own expense.`,
    );
  if (changes.amountKobo <= 0) {
    await expense.softDelete();
    return;
  }
  expense.set(changes);
  await expense.save();
}

/** Removes a batch's chicks expense with the batch, unless it was paid through Paystack. */
export async function assertChicksRemovable(batchId: Types.ObjectId | string, code: string) {
  const expense = await chickExpenseOf(batchId);
  if (expense && (await sentThroughPaystack(expense._id)))
    throw new HttpError(
      409,
      "chicks_paid",
      `${code}'s chicks were paid through Paystack, so it stays on record. Close it instead.`,
    );
}

export async function dropChicks(session: ClientSession, batchId: Types.ObjectId | string) {
  const expense = await chickExpenseOf(batchId, session);
  if (expense) await expense.softDelete();
}
