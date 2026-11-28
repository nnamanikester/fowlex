import "server-only";

import { Types } from "mongoose";

import { connectDb } from "@/lib/db";
import { ledger } from "@/lib/inventory/stock";
import { type CostKind, kindOf } from "./kinds";

export { COST_KIND_LABELS, COST_KINDS, type CostKind, kindOf } from "./kinds";
import { ExpenseModel } from "@/models/expense";
import { InventoryItemModel } from "@/models/inventory-item";
import { StockMovementModel } from "@/models/stock-movement";

/**
 * What an expense adds to costs when it's spent. Stock bought (an expense with item lines) becomes
 * a cost as it's used, at its average cost, so only the delivery charge counts here.
 */
export const COST_OF_EXPENSE = {
  $cond: [{ $gt: [{ $size: { $ifNull: ["$lines", []] } }, 0] }, { $ifNull: ["$deliveryKobo", 0] }, "$amountKobo"],
};

export type CostSheet = {
  byKind: Record<CostKind, number>;
  /** Expenses charged to the batch (approved, not equipment) and stock it used. */
  expensesKobo: number;
  stockKobo: number;
  totalKobo: number;
};

const empty = (): CostSheet => ({
  byKind: { chicks: 0, feed: 0, medication: 0, labour: 0, other: 0 },
  expensesKobo: 0,
  stockKobo: 0,
  totalKobo: 0,
});

/**
 * Each batch's direct costs, by kind, for many batches at once: its approved expenses (equipment
 * aside: that's spread over its life; stock bought: that counts as it's used) summed by category
 * in one aggregation, and the stock it used
 * (feed, drugs, vaccines, litter…) at the average cost on the day it was used. Shared costs (rent,
 * power, salaried staff) come on top in 8.2.
 */
export async function costSheets(farmId: string, batchIds: string[]): Promise<Map<string, CostSheet>> {
  await connectDb();
  const ids = [...new Set(batchIds)].filter((id) => Types.ObjectId.isValid(id));
  const sheets = new Map(ids.map((id) => [id, empty()]));
  if (!ids.length) return sheets;
  const oids = ids.map((id) => new Types.ObjectId(id));
  const farm = new Types.ObjectId(farmId);

  const [expenses, used] = await Promise.all([
    ExpenseModel.aggregate<{ _id: { batchId: Types.ObjectId; category: string }; kobo: number }>([
      {
        $match: {
          farmId: farm,
          batchId: { $in: oids },
          // Approved, or from before approvals (they count as approved).
          approval: { $in: ["approved", null] },
          capital: { $ne: true },
          deletedAt: null,
        },
      },
      { $group: { _id: { batchId: "$batchId", category: "$category" }, kobo: { $sum: COST_OF_EXPENSE } } },
    ]),
    StockMovementModel.find({ farmId, batchId: { $in: oids }, quantity: { $lt: 0 } }, { itemId: 1 }).lean(),
  ]);
  for (const row of expenses) {
    const sheet = sheets.get(String(row._id.batchId))!;
    sheet.byKind[kindOf(row._id.category)] += row.kobo;
    sheet.expensesKobo += row.kobo;
  }

  // Stock used, at the average of the day: each item's whole ledger replayed once.
  const itemIds = [...new Set(used.map((m) => String(m.itemId)))];
  if (itemIds.length) {
    const [items, movements] = await Promise.all([
      InventoryItemModel.find({ farmId, _id: { $in: itemIds } }, { category: 1 })
        .setOptions({ withDeleted: true })
        .lean(),
      StockMovementModel.find({ farmId, itemId: { $in: itemIds } }).lean(),
    ]);
    for (const item of items) {
      const { rows } = ledger(
        movements
          .filter((m) => String(m.itemId) === String(item._id))
          .map((m) => ({
            id: String(m._id),
            type: m.type,
            date: m.date,
            quantity: m.quantity,
            unitCostKobo: m.unitCostKobo ?? null,
            createdAt: m.createdAt.toISOString(),
            batchId: m.batchId ? String(m.batchId) : null,
          })),
      );
      for (const r of rows) {
        const sheet = r.batchId && r.quantity < 0 ? sheets.get(r.batchId) : undefined;
        if (!sheet) continue;
        sheet.byKind[kindOf(item.category)] += -r.valueKobo;
        sheet.stockKobo += -r.valueKobo;
      }
    }
  }
  for (const sheet of sheets.values()) sheet.totalKobo = sheet.expensesKobo + sheet.stockKobo;
  return sheets;
}

/** Cost per bird placed, per bird still on the farm or sold, and per kg of live weight, when known. */
export function perUnit(
  sheet: Pick<CostSheet, "totalKobo">,
  batch: { placed: number; survivors: number; weightGrams: number | null },
) {
  const kg = batch.weightGrams && batch.survivors ? (batch.survivors * batch.weightGrams) / 1000 : 0;
  return {
    perBirdPlacedKobo: batch.placed ? Math.round(sheet.totalKobo / batch.placed) : null,
    perSurvivorKobo: batch.survivors ? Math.round(sheet.totalKobo / batch.survivors) : null,
    perKgKobo: kg ? Math.round(sheet.totalKobo / kg) : null,
  };
}
