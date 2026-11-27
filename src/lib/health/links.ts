import "server-only";

import { type ClientSession, Types } from "mongoose";

import { type HealthInput, KIND_LABELS } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { readSettings } from "@/lib/settings/service";
import { nextSequence } from "@/models/counter";
import { ExpenseModel } from "@/models/expense";
import { InventoryItemModel } from "@/models/inventory-item";
import { PayoutModel } from "@/models/payout";
import { StockMovementModel } from "@/models/stock-movement";

/** How something bought for a health record was paid: already, or owed. */
export const HEALTH_PAYMENTS = ["cash", "transfer", "pos", "later"] as const;
export type HealthPayment = (typeof HEALTH_PAYMENTS)[number];

type Linked = Pick<HealthInput, "date" | "kind" | "product" | "costKobo"> & {
  _id: Types.ObjectId;
  batchId: Types.ObjectId;
  itemId?: Types.ObjectId | string | null;
  quantity?: number | null;
};

const STOCK_KINDS = ["medication", "vaccine", "disinfectant", "other"];

/** The stock item a record used: on the farm, and a drug, vaccine or the like (not feed). */
export async function assertHealthItem(farmId: string, itemId: string | null | undefined) {
  if (!itemId) return null;
  const item = await InventoryItemModel.findOne({ _id: itemId, farmId }, { name: 1, category: 1 }).lean();
  if (!item || !STOCK_KINDS.includes(item.category))
    throw new HttpError(400, "invalid_health", "Choose a drug or vaccine from your stock.", "itemId");
  return item;
}

/** Would a cost this big wait for an owner? The same rule as any expense. */
export async function healthNeedsApproval(actor: CurrentUser, amountKobo: number) {
  return (
    !can(actor.role, "expense.approve") && amountKobo > (await readSettings(actor.farmId)).expenseApprovalLimitKobo
  );
}

const source = (kind: "health", id: Types.ObjectId) => ({ "source.kind": kind, "source.id": id });

/**
 * Keeps a health record's stock and money in step, inside its transaction:
 * - taken from stock: a usage of that item, charged to the batch (costed at the stock's average);
 * - bought for it (a cost): a drugs-and-vaccines expense (vet visits: Other), charged to the batch.
 * Neither when it's neither. An expense paid through Paystack keeps its amount.
 */
export async function syncHealthLinks(
  session: ClientSession,
  actor: CurrentUser,
  event: Linked,
  { paidBy = "cash", pending = false }: { paidBy?: HealthPayment; pending?: boolean } = {},
) {
  const movement = await StockMovementModel.findOne(source("health", event._id)).session(session);
  if (event.itemId && event.quantity) {
    const values = {
      itemId: new Types.ObjectId(String(event.itemId)),
      date: event.date,
      quantity: -event.quantity,
      batchId: event.batchId,
    };
    if (movement) {
      movement.set(values);
      await movement.save();
    } else
      await StockMovementModel.create(
        [
          {
            ...values,
            farmId: actor.farmId,
            createdBy: actor.id,
            type: "usage",
            source: { kind: "health", id: event._id },
          },
        ],
        { session },
      );
  } else if (movement) await movement.softDelete();

  const expense = await ExpenseModel.findOne(source("health", event._id)).session(session);
  const cost = event.itemId ? 0 : event.costKobo;
  const description = `${KIND_LABELS[event.kind]}${event.product ? `: ${event.product}` : ""}`.slice(0, 200);
  if (cost > 0) {
    if (expense) {
      if (
        cost !== expense.amountKobo &&
        (await PayoutModel.exists({ expenseId: expense._id, status: { $in: ["pending", "otp", "success"] } }))
      )
        throw new HttpError(
          409,
          "health_paid",
          "That was paid through Paystack, so its cost stays. Record any difference as its own expense.",
        );
      expense.set({
        amountKobo: cost,
        description,
        date: expense.paymentStatus === "paid" ? expense.date : event.date,
      });
      await expense.save();
      return;
    }
    const year = event.date.slice(0, 4);
    const seq = await nextSequence(actor.farmId, `expense:${year}`, session);
    const paid = paidBy !== "later";
    await ExpenseModel.create(
      [
        {
          farmId: actor.farmId,
          createdBy: actor.id,
          number: `EXP-${year}-${String(seq).padStart(4, "0")}`,
          date: event.date,
          category: event.kind === "vet-visit" ? "other" : "medication",
          description,
          batchId: event.batchId,
          amountKobo: cost,
          method: paidBy,
          paymentStatus: paid ? "paid" : "unpaid",
          paidOn: paid ? event.date : null,
          approval: pending ? "pending" : "approved",
          source: { kind: "health", id: event._id },
        },
      ],
      { session },
    );
  } else if (expense) {
    if (await PayoutModel.exists({ expenseId: expense._id, status: { $in: ["pending", "otp", "success"] } }))
      throw new HttpError(409, "health_paid", "That was paid through Paystack, so its cost stays.");
    await expense.softDelete();
  }
}

/** Removes a deleted health record's stock usage and expense (unless paid through Paystack). */
export async function dropHealthLinks(session: ClientSession, eventId: Types.ObjectId) {
  const expense = await ExpenseModel.findOne(source("health", eventId)).session(session);
  if (expense && (await PayoutModel.exists({ expenseId: expense._id, status: { $in: ["pending", "otp", "success"] } })))
    throw new HttpError(409, "health_paid", "Money for this went through Paystack, so the record stays.");
  if (expense) await expense.softDelete();
  const movement = await StockMovementModel.findOne(source("health", eventId)).session(session);
  if (movement) await movement.softDelete();
}
