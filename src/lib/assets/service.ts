import "server-only";

import { type ClientSession, Types } from "mongoose";

import { type AssetInput, type AssetStatus, bookValue, depreciationFor, validateAsset } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { isISODate, today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { AssetModel } from "@/models/asset";

export type AssetView = AssetInput & {
  id: string;
  version: number;
  status: AssetStatus;
  disposedOn: string | null;
  proceedsKobo: number;
  expenseId: string | null;
  /** Worth now, and this month's depreciation. */
  bookValueKobo: number;
  monthlyKobo: number;
};

type Doc = AssetInput & {
  _id: unknown;
  __v?: number;
  status: AssetStatus;
  disposedOn?: string | null;
  proceedsKobo?: number;
  expenseId?: unknown;
};
const view = (a: Doc, today: string): AssetView => ({
  id: String(a._id),
  version: a.__v ?? 0,
  name: a.name,
  kind: a.kind,
  costKobo: a.costKobo,
  salvageKobo: a.salvageKobo ?? 0,
  purchasedOn: a.purchasedOn,
  usefulLifeMonths: a.usefulLifeMonths,
  notes: a.notes ?? "",
  status: a.status,
  disposedOn: a.disposedOn ?? null,
  proceedsKobo: a.proceedsKobo ?? 0,
  expenseId: a.expenseId ? String(a.expenseId) : null,
  bookValueKobo: a.status === "in-use" ? bookValue(a, today) : 0,
  monthlyKobo: depreciationFor(a, today.slice(0, 7)),
});

/** The farm's equipment, newest first. */
export async function listAssets(farmId: string, today = lagosToday()) {
  await connectDb();
  const docs = await AssetModel.find({ farmId }).sort({ purchasedOn: -1, createdAt: -1 }).lean();
  return docs.map((d) => view(d as unknown as Doc, today));
}

function clean(input: Record<string, unknown>, today: string): AssetInput {
  const values = {
    name: typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : input.name,
    kind: input.kind,
    costKobo: input.costKobo,
    salvageKobo: input.salvageKobo === undefined || input.salvageKobo === "" ? 0 : input.salvageKobo,
    purchasedOn: input.purchasedOn === undefined || input.purchasedOn === "" ? today : input.purchasedOn,
    usefulLifeMonths: input.usefulLifeMonths,
    notes: typeof input.notes === "string" ? input.notes.trim() : (input.notes ?? ""),
  };
  const errors = validateAsset(values, { today });
  const [field] = Object.keys(errors) as (keyof AssetInput)[];
  if (field) throw new HttpError(400, "invalid_asset", errors[field]!, field);
  return values as AssetInput;
}

/** Adds equipment the farm already has (bought before Fowlex, or paid for elsewhere). */
export async function createAsset(actor: CurrentUser, input: Record<string, unknown>, today = lagosToday()) {
  const values = clean(input, today);
  await connectDb();
  const doc = await AssetModel.create({ ...values, farmId: actor.farmId, createdBy: actor.id });
  return view(doc.toObject() as unknown as Doc, today);
}

/**
 * Equipment bought through Spend money: made with the expense, in its transaction. Its cost and day
 * are the expense's. Checked first (without saving) by `checkAssetFromExpense`.
 */
export function checkAssetFromExpense(input: unknown, expense: { amountKobo: number; date: string }, today: string) {
  const a = (input ?? {}) as Record<string, unknown>;
  try {
    return clean({ ...a, costKobo: expense.amountKobo, purchasedOn: expense.date }, today);
  } catch (error) {
    const e = error as HttpError;
    throw new HttpError(400, e.code, e.message, `asset.${e.field}`);
  }
}

export async function createAssetFromExpense(
  session: ClientSession,
  actor: CurrentUser,
  values: AssetInput,
  expenseId: Types.ObjectId,
) {
  await AssetModel.create([{ ...values, expenseId, farmId: actor.farmId, createdBy: actor.id }], { session });
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id) ? await AssetModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!doc) throw new HttpError(404, "not_found", "That equipment doesn't exist any more.");
  return doc;
}

const stale = () =>
  new HttpError(409, "stale", "Someone changed this equipment while you were editing. Open it again.");

/** Saves equipment from a form no older than the last save. Bought through an expense, its cost and day stay the expense's. */
export async function updateAsset(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  version: unknown,
  today = lagosToday(),
) {
  const doc = await load(actor, id);
  if (typeof version !== "number" || version !== doc.__v) throw stale();
  const values = clean(
    doc.expenseId ? { ...input, costKobo: doc.costKobo, purchasedOn: doc.purchasedOn } : input,
    today,
  );
  doc.set(values);
  try {
    await doc.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return view(doc.toObject() as unknown as Doc, today);
}

/** Records equipment sold (for how much) or scrapped: it stops depreciating after that month. */
export async function disposeAsset(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  today = lagosToday(),
) {
  const doc = await load(actor, id);
  if (doc.status !== "in-use") throw new HttpError(409, "disposed", `${doc.name} is already ${doc.status}.`);
  const status = input.status;
  if (status !== "sold" && status !== "scrapped")
    throw new HttpError(400, "invalid_asset", "Choose sold or scrapped.", "status");
  const on = input.disposedOn === undefined || input.disposedOn === "" ? today : input.disposedOn;
  if (typeof on !== "string" || !isISODate(on) || on > today || on < doc.purchasedOn)
    throw new HttpError(400, "invalid_asset", "Choose a day from when it was bought to today.", "disposedOn");
  const proceeds = status === "sold" ? (input.proceedsKobo ?? 0) : 0;
  if (typeof proceeds !== "number" || !Number.isInteger(proceeds) || proceeds < 0)
    throw new HttpError(400, "invalid_asset", "Enter what it sold for.", "proceedsKobo");
  doc.set({ status, disposedOn: on, proceedsKobo: proceeds });
  await doc.save();
  return view(doc.toObject() as unknown as Doc, today);
}

/** Removes equipment added by hand. One bought through an expense goes when the expense is deleted. */
export async function deleteAsset(actor: CurrentUser, id: string) {
  const doc = await load(actor, id);
  if (doc.expenseId)
    throw new HttpError(
      409,
      "has_expense",
      "This came with an expense. Delete the expense, or mark it sold or scrapped.",
    );
  await doc.softDelete();
}
