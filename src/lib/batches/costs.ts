import "server-only";

import { Types } from "mongoose";

import { connectDb } from "@/lib/db";
import { costSheets, type CostSheet } from "@/lib/finance/batch-costs";
import { ledger } from "@/lib/inventory/stock";
import { ExpenseModel } from "@/models/expense";
import { InventoryItemModel } from "@/models/inventory-item";
import { StockMovementModel } from "@/models/stock-movement";

export type BatchCosts = {
  expenses: {
    id: string;
    number: string;
    date: string;
    description: string;
    category: string;
    amountKobo: number;
    approval: string;
    paymentStatus: string;
    /** Equipment: spread over its life (phase 8), so not counted here. */
    capital: boolean;
  }[];
  /** Stock it used (feed from logs, drugs), by item, at the average cost when used. */
  stock: { itemId: string; name: string; unit: string; quantity: number; costKobo: number }[];
  expensesKobo: number;
  stockKobo: number;
  totalKobo: number;
  /** The total by kind: chicks, feed, drugs and vaccines, labour, everything else. */
  byKind: CostSheet["byKind"];
};

/**
 * What a batch has cost so far: expenses charged to it (approved, not equipment) and the stock it
 * used. Phase 8 adds its share of the farm's shared costs.
 */
export async function batchCosts(farmId: string, batchId: string): Promise<BatchCosts> {
  await connectDb();
  const empty = {
    expenses: [],
    stock: [],
    expensesKobo: 0,
    stockKobo: 0,
    totalKobo: 0,
    byKind: { chicks: 0, feed: 0, medication: 0, labour: 0, other: 0 },
  };
  if (!Types.ObjectId.isValid(batchId)) return empty;
  const id = new Types.ObjectId(batchId);
  const [expenses, used] = await Promise.all([
    ExpenseModel.find({ farmId, batchId: id, approval: { $ne: "rejected" } })
      .sort({ date: -1, createdAt: -1 })
      .lean(),
    StockMovementModel.find({ farmId, batchId: id, quantity: { $lt: 0 } }, { itemId: 1 }).lean(),
  ]);

  // Cost each item's usage by replaying its whole ledger: usage leaves at the average of the day.
  const itemIds = [...new Set(used.map((m) => String(m.itemId)))];
  const [items, movements] = await Promise.all([
    InventoryItemModel.find({ farmId, _id: { $in: itemIds } }, { name: 1, unit: 1 })
      .setOptions({ withDeleted: true })
      .lean(),
    StockMovementModel.find({ farmId, itemId: { $in: itemIds } }).lean(),
  ]);
  const stock = items.map((item) => {
    const rows = ledger(
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
    ).rows.filter((r) => r.batchId === batchId && r.quantity < 0);
    return {
      itemId: String(item._id),
      name: item.name,
      unit: item.unit,
      quantity: Math.round(-rows.reduce((n, r) => n + r.quantity, 0) * 1000) / 1000,
      costKobo: -rows.reduce((n, r) => n + r.valueKobo, 0),
    };
  });
  stock.sort((a, b) => b.costKobo - a.costKobo);

  const list = expenses.map((e) => ({
    id: String(e._id),
    number: e.number,
    date: e.date,
    description: e.description ?? "",
    category: e.category,
    amountKobo: e.amountKobo,
    approval: e.approval ?? "approved",
    paymentStatus: e.paymentStatus,
    capital: e.capital ?? false,
  }));
  // The totals are the cost sheet's, so the page and every report agree.
  const sheet = (await costSheets(farmId, [batchId])).get(batchId)!;
  return {
    expenses: list,
    stock,
    expensesKobo: sheet.expensesKobo,
    stockKobo: sheet.stockKobo,
    totalKobo: sheet.totalKobo,
    byKind: sheet.byKind,
  };
}
