import "server-only";

import { Types } from "mongoose";

import { stockLevels } from "./movements";
import { type ItemInput, nameKey, tidyName, validateItem } from "./rules";
import { isLow, type StockLevel } from "./stock";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { connectDb } from "@/lib/db";
import { ExpenseModel } from "@/models/expense";
import { InventoryItemModel } from "@/models/inventory-item";
import { StockMovementModel } from "@/models/stock-movement";

export type ItemView = ItemInput &
  StockLevel & {
    id: string;
    version: number;
    archived: boolean;
    /** At or under its reorder level. */
    low: boolean;
    /** The last purchase: who from and at what price, to buy again in a tap. */
    lastBought?: { supplierId: string | null; unitCostKobo: number; date: string } | null;
  };

const NONE: StockLevel = { onHand: 0, valueKobo: 0, avgCostKobo: null };

type Doc = ItemInput & { _id: unknown; __v?: number; archived?: boolean };
const view = (i: Doc, level: StockLevel = NONE): ItemView => ({
  id: String(i._id),
  version: i.__v ?? 0,
  name: i.name,
  category: i.category,
  unit: i.unit,
  unitKg: i.unitKg ?? null,
  reorderLevel: i.reorderLevel ?? null,
  notes: i.notes ?? "",
  archived: i.archived ?? false,
  ...level,
  low: !i.archived && isLow(level.onHand, i.reorderLevel ?? null),
});

/** The farm's stock items, by category then name. */
export async function listItems(farmId: string): Promise<ItemView[]> {
  await connectDb();
  const [items, levels, last] = await Promise.all([
    InventoryItemModel.find({ farmId })
      .collation({ locale: "en", numericOrdering: true })
      .sort({ category: 1, name: 1 })
      .lean(),
    stockLevels(farmId),
    lastPurchases(farmId),
  ]);
  return items.map((i) => ({
    ...view(i as unknown as Doc, levels.get(String(i._id))),
    lastBought: last.get(String(i._id)) ?? null,
  }));
}

function clean(input: Record<string, unknown>): ItemInput {
  const empty = (v: unknown) => v === "" || v === undefined || v === null;
  const values = {
    name: typeof input.name === "string" ? tidyName(input.name) : input.name,
    category: input.category,
    unit: input.unit,
    unitKg: empty(input.unitKg) ? null : input.unitKg,
    reorderLevel: empty(input.reorderLevel) ? null : input.reorderLevel,
    notes: typeof input.notes === "string" ? input.notes.trim() : (input.notes ?? ""),
  };
  const errors = validateItem(values);
  const [field] = Object.keys(errors) as (keyof ItemInput)[];
  if (field) throw new HttpError(400, "invalid_item", errors[field]!, field);
  return values as ItemInput;
}

const duplicate = (name: string) =>
  new HttpError(409, "duplicate_name", `There's already an item called ${name}. Use another name.`, "name");
const stale = () => new HttpError(409, "stale", "Someone changed this item while you were editing. Open it again.");

export async function createItem(actor: CurrentUser, input: Record<string, unknown>): Promise<ItemView> {
  const values = clean(input);
  await connectDb();
  try {
    const item = await InventoryItemModel.create({
      ...values,
      nameKey: nameKey(values.name),
      farmId: actor.farmId,
      createdBy: actor.id,
    });
    return view(item.toObject() as unknown as Doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw duplicate(values.name);
    throw error;
  }
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const item = await InventoryItemModel.findOne({ _id: id, farmId: actor.farmId }).catch(() => null);
  if (!item) throw new HttpError(404, "not_found", "That item doesn't exist any more.");
  return item;
}

/** Saves an item from a form no older than the last save. `archived` hides it from new records. */
export async function updateItem(actor: CurrentUser, id: string, input: Record<string, unknown>, version: unknown) {
  const values = clean(input);
  const item = await load(actor, id);
  if (typeof version !== "number" || version !== item.__v) throw stale();
  item.set({
    ...values,
    nameKey: nameKey(values.name),
    ...(typeof input.archived === "boolean" && { archived: input.archived }),
  });
  try {
    await item.save();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw duplicate(values.name);
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return view(item.toObject() as unknown as Doc, (await stockLevels(actor.farmId)).get(id));
}

/** Removes an item with no stock history. One with history is archived instead, keeping it. */
export async function deleteItem(actor: CurrentUser, id: string) {
  const item = await load(actor, id);
  if (await StockMovementModel.exists({ farmId: actor.farmId, itemId: item._id }))
    throw new HttpError(409, "has_history", `${item.name} has stock history. Archive it instead.`);
  await item.softDelete();
}

/** Each item's latest purchase: its price, and the supplier of the expense that bought it. */
async function lastPurchases(farmId: string) {
  const rows = await StockMovementModel.aggregate<{
    _id: unknown;
    unitCostKobo: number;
    date: string;
    expenseId: unknown;
  }>([
    { $match: { farmId: new Types.ObjectId(farmId), type: "purchase", "source.kind": "purchase" } },
    { $sort: { date: -1, createdAt: -1 } },
    {
      $group: {
        _id: "$itemId",
        unitCostKobo: { $first: "$unitCostKobo" },
        date: { $first: "$date" },
        expenseId: { $first: "$source.id" },
      },
    },
  ]);
  const expenses = await ExpenseModel.find({ _id: { $in: rows.map((r) => r.expenseId) } }, { supplierId: 1 }).lean();
  const supplierOf = new Map(expenses.map((e) => [String(e._id), e.supplierId ? String(e.supplierId) : null]));
  return new Map(
    rows.map((r) => [
      String(r._id),
      { supplierId: supplierOf.get(String(r.expenseId)) ?? null, unitCostKobo: r.unitCostKobo, date: r.date },
    ]),
  );
}
