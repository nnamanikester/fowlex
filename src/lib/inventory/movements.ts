import "server-only";

import type { ClientSession } from "mongoose";
import { Types } from "mongoose";

import { quantity as formatQuantity } from "./rules";
import { ledger, type LedgerRow, type Movement, type MovementType, type StockLevel } from "./stock";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { isISODate, today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { BatchModel } from "@/models/batch";
import { InventoryItemModel } from "@/models/inventory-item";
import { StockMovementModel } from "@/models/stock-movement";

export type MovementView = Movement & {
  batchId: string | null;
  source: { kind: "daily-log" | "purchase" | "health"; id: string } | null;
  notes: string;
};

type Doc = {
  _id: unknown;
  itemId: unknown;
  type: MovementType;
  date: string;
  quantity: number;
  unitCostKobo?: number | null;
  batchId?: unknown;
  source?: { kind?: string | null; id?: unknown };
  notes?: string;
  createdAt?: Date;
};
const view = (m: Doc): MovementView => ({
  id: String(m._id),
  type: m.type,
  date: m.date,
  quantity: m.quantity,
  unitCostKobo: m.unitCostKobo ?? null,
  createdAt: (m.createdAt ?? new Date(0)).toISOString(),
  batchId: m.batchId ? String(m.batchId) : null,
  source:
    m.source?.kind && m.source.id
      ? { kind: m.source.kind as "daily-log" | "purchase" | "health", id: String(m.source.id) }
      : null,
  notes: m.notes ?? "",
});

/** An item's movements, newest first, each with its cost and the balance after it. */
export async function listMovements(farmId: string, itemId: string): Promise<LedgerRow<MovementView>[]> {
  await connectDb();
  if (!Types.ObjectId.isValid(itemId)) return [];
  const docs = await StockMovementModel.find({ farmId, itemId }).lean();
  return ledger(docs.map((d) => view(d as unknown as Doc))).rows.reverse();
}

/** Stock on hand and value for each item with movements. */
export async function stockLevels(farmId: string): Promise<Map<string, StockLevel>> {
  await connectDb();
  const docs = await StockMovementModel.find({ farmId }).lean();
  const byItem = new Map<string, MovementView[]>();
  for (const d of docs) {
    const key = String(d.itemId);
    byItem.set(key, [...(byItem.get(key) ?? []), view(d as unknown as Doc)]);
  }
  return new Map([...byItem].map(([id, movements]) => [id, ledger(movements).level]));
}

async function loadItem(farmId: string, itemId: unknown) {
  const item =
    typeof itemId === "string" && Types.ObjectId.isValid(itemId)
      ? await InventoryItemModel.findOne({ _id: itemId, farmId }).lean()
      : null;
  if (!item) throw new HttpError(400, "invalid_movement", "Choose an item on the farm.", "itemId");
  return item;
}

const bad = (field: string, message: string) => new HttpError(400, "invalid_movement", message, field);

/**
 * Records stock by hand: opening stock (what's already on the shelf, with its cost), usage
 * (optionally charged to a batch), or a count (`counted` units found, recorded as the difference).
 */
export async function recordMovement(
  actor: CurrentUser,
  input: Record<string, unknown>,
  today = lagosToday(),
): Promise<MovementView | null> {
  await connectDb();
  const item = await loadItem(actor.farmId, input.itemId);
  const type = input.type;
  const date = input.date === undefined || input.date === "" ? today : input.date;
  if (typeof date !== "string" || !isISODate(date)) throw bad("date", "Choose the day.");
  if (date > today) throw bad("date", "That's in the future.");
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 500) : "";
  const amount = input.quantity;
  const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 10_000_000;

  let quantity: number;
  let unitCostKobo: number | null = null;
  let batchId: Types.ObjectId | null = null;
  if (type === "opening") {
    if (!positive(amount)) throw bad("quantity", "Enter how many are on hand.");
    const cost = input.unitCostKobo;
    if (typeof cost !== "number" || !Number.isInteger(cost) || cost < 0)
      throw bad("unitCostKobo", "Enter what one cost, so its value is known.");
    quantity = amount;
    unitCostKobo = cost;
  } else if (type === "usage") {
    if (!positive(amount)) throw bad("quantity", "Enter how many were used.");
    quantity = -amount;
    if (input.batchId) {
      const batch =
        typeof input.batchId === "string" && Types.ObjectId.isValid(input.batchId)
          ? await BatchModel.findOne({ _id: input.batchId, farmId: actor.farmId }).lean()
          : null;
      if (!batch) throw bad("batchId", "Choose a batch on the farm.");
      if (batch.status === "closed") throw new HttpError(409, "closed", `${batch.code} is closed.`, "batchId");
      batchId = batch._id;
    }
  } else if (type === "count") {
    const counted = input.counted;
    if (typeof counted !== "number" || !Number.isFinite(counted) || counted < 0 || counted > 10_000_000)
      throw bad("counted", "Enter how many you counted.");
    const level = (await stockLevels(actor.farmId)).get(String(item._id));
    quantity = Math.round((counted - (level?.onHand ?? 0)) * 1000) / 1000;
    // Nothing to record when the count matches.
    if (quantity === 0) return null;
  } else throw bad("type", "Choose opening stock, usage or a count.");

  const doc = await StockMovementModel.create({
    farmId: actor.farmId,
    createdBy: actor.id,
    itemId: item._id,
    type: type === "count" ? "adjustment" : type,
    date,
    quantity,
    unitCostKobo,
    batchId,
    notes: notes || (type === "count" ? `Counted ${formatQuantity(input.counted as number, item.unit)}` : ""),
  });
  return view(doc.toObject() as unknown as Doc);
}

/** Removes a movement made by hand. One made by a log or purchase changes with that record. */
export async function deleteMovement(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id) ? await StockMovementModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!doc) throw new HttpError(404, "not_found", "That stock record doesn't exist any more.");
  if (doc.source?.id)
    throw new HttpError(
      409,
      "has_source",
      doc.source.kind === "daily-log"
        ? "This came from a daily log. Change the log instead."
        : doc.source.kind === "health"
          ? "This came from a health record. Change it there."
          : "This came from a purchase. Change the purchase instead.",
    );
  await doc.softDelete();
}

/**
 * Keeps a daily log's feed in step with stock: the kg logged leave the chosen feed item, charged to
 * the log's batch. Run inside the log's transaction; a log without a feed item (or feed) has none.
 */
export async function syncLogFeed(
  session: ClientSession,
  actor: CurrentUser,
  log: {
    id: string;
    batchId: string;
    date: string;
    feedKg: number;
    feedItemId: string | null;
    supplies?: { itemId: string; quantity: number }[];
  },
) {
  const source = { "source.kind": "daily-log" as const, "source.id": new Types.ObjectId(log.id) };
  const existing = await StockMovementModel.find({ farmId: actor.farmId, ...source }).session(session);
  // What the log takes from stock: its feed (kg into the item's unit) and every other thing used.
  const wanted = new Map<string, number>();
  if (log.feedItemId && log.feedKg > 0) {
    const feed = await InventoryItemModel.findOne({ _id: log.feedItemId, farmId: actor.farmId })
      .session(session)
      .lean();
    if (feed) wanted.set(String(feed._id), log.feedKg / (feed.unit === "kg" ? 1 : (feed.unitKg ?? 1)));
  }
  for (const s of log.supplies ?? [])
    if (s.quantity > 0) wanted.set(s.itemId, (wanted.get(s.itemId) ?? 0) + s.quantity);
  for (const m of existing) if (!wanted.has(String(m.itemId))) await m.softDelete();
  for (const [itemId, used] of wanted) {
    const values = {
      date: log.date,
      quantity: -Math.round(used * 1000) / 1000,
      batchId: new Types.ObjectId(log.batchId),
    };
    const keep = existing.find((m) => String(m.itemId) === itemId);
    if (keep) {
      keep.set(values);
      await keep.save();
    } else
      await StockMovementModel.create(
        [
          {
            ...values,
            farmId: actor.farmId,
            createdBy: actor.id,
            itemId: new Types.ObjectId(itemId),
            type: "usage",
            source: { kind: "daily-log", id: new Types.ObjectId(log.id) },
          },
        ],
        { session },
      );
  }
}

/** Takes a deleted log's feed back off its batch. */
export async function dropLogFeed(session: ClientSession, actor: CurrentUser, logId: string) {
  const existing = await StockMovementModel.find({
    farmId: actor.farmId,
    "source.kind": "daily-log" as const,
    "source.id": new Types.ObjectId(logId),
  }).session(session);
  for (const m of existing) await m.softDelete();
}
