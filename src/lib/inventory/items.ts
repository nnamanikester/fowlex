import "server-only";

import { type ItemInput, nameKey, tidyName, validateItem } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { connectDb } from "@/lib/db";
import { InventoryItemModel } from "@/models/inventory-item";

export type ItemView = ItemInput & { id: string; version: number; archived: boolean };

type Doc = ItemInput & { _id: unknown; __v?: number; archived?: boolean };
const view = (i: Doc): ItemView => ({
  id: String(i._id),
  version: i.__v ?? 0,
  name: i.name,
  category: i.category,
  unit: i.unit,
  unitKg: i.unitKg ?? null,
  reorderLevel: i.reorderLevel ?? null,
  notes: i.notes ?? "",
  archived: i.archived ?? false,
});

/** The farm's stock items, by category then name. */
export async function listItems(farmId: string): Promise<ItemView[]> {
  await connectDb();
  const items = await InventoryItemModel.find({ farmId })
    .collation({ locale: "en", numericOrdering: true })
    .sort({ category: 1, name: 1 })
    .lean();
  return items.map((i) => view(i as unknown as Doc));
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
  return view(item.toObject() as unknown as Doc);
}

/** Removes an item. Once it has stock history (step 3.2) it's archived instead. */
export async function deleteItem(actor: CurrentUser, id: string) {
  const item = await load(actor, id);
  await item.softDelete();
}
