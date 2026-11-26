import "server-only";

import { Types } from "mongoose";

import { type LogInput, validateLog } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { placedCount } from "@/lib/batches/rules";
import { today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { BatchModel } from "@/models/batch";
import { DailyLogModel } from "@/models/daily-log";

export type LogView = LogInput & { id: string; version: number };

type Doc = Omit<LogInput, "batchId"> & { _id: unknown; __v?: number; batchId: unknown };
const view = (l: Doc): LogView => ({
  id: String(l._id),
  version: l.__v ?? 0,
  batchId: String(l.batchId),
  date: l.date,
  deaths: l.deaths,
  culls: l.culls,
  sold: l.sold,
  feedKg: l.feedKg,
  feedType: l.feedType ?? "",
  waterLitres: l.waterLitres ?? null,
  avgWeightGrams: l.avgWeightGrams ?? null,
  notes: l.notes ?? "",
});

/** A batch's logs, newest day first. */
export async function listLogs(farmId: string, batchId: string): Promise<LogView[]> {
  await connectDb();
  if (!Types.ObjectId.isValid(batchId)) return [];
  const logs = await DailyLogModel.find({ farmId, batchId }).sort({ date: -1 }).lean();
  return logs.map((l) => view(l as unknown as Doc));
}

export type LogTotals = {
  deaths: number;
  culls: number;
  sold: number;
  feedKg: number;
  days: number;
  /** The latest weighing, if any. */
  lastWeight: { date: string; grams: number } | null;
};
export const NO_TOTALS: LogTotals = { deaths: 0, culls: 0, sold: 0, feedKg: 0, days: 0, lastWeight: null };

/** Each batch's totals from its logs, in one aggregation. `excludeLogId` leaves one log out. */
export async function logTotals(farmId: string, batchIds: string[], excludeLogId?: string) {
  await connectDb();
  const ids = batchIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  const rows = await DailyLogModel.aggregate<
    LogTotals & { _id: Types.ObjectId; weights: { date: string; grams: number }[] }
  >([
    {
      $match: {
        farmId: new Types.ObjectId(farmId),
        batchId: { $in: ids },
        ...(excludeLogId && Types.ObjectId.isValid(excludeLogId) && { _id: { $ne: new Types.ObjectId(excludeLogId) } }),
      },
    },
    { $sort: { date: 1 } },
    {
      $group: {
        _id: "$batchId",
        deaths: { $sum: "$deaths" },
        culls: { $sum: "$culls" },
        sold: { $sum: "$sold" },
        feedKg: { $sum: "$feedKg" },
        days: { $sum: 1 },
        weights: {
          $push: { $cond: [{ $gt: ["$avgWeightGrams", 0] }, { date: "$date", grams: "$avgWeightGrams" }, "$$REMOVE"] },
        },
      },
    },
  ]);
  return new Map(
    rows.map((r) => [
      String(r._id),
      {
        deaths: r.deaths,
        culls: r.culls,
        sold: r.sold,
        feedKg: Math.round(r.feedKg * 10) / 10,
        days: r.days,
        lastWeight: r.weights.at(-1) ?? null,
      } satisfies LogTotals,
    ]),
  );
}

function clean(input: Record<string, unknown>) {
  const num = (v: unknown, empty: number | null) => (v === "" || v === undefined || v === null ? empty : v);
  return {
    batchId: input.batchId,
    date: input.date,
    deaths: num(input.deaths, 0),
    culls: num(input.culls, 0),
    sold: num(input.sold, 0),
    feedKg: num(input.feedKg, 0),
    feedType: typeof input.feedType === "string" ? input.feedType.trim() : (input.feedType ?? ""),
    waterLitres: num(input.waterLitres, null),
    avgWeightGrams: num(input.avgWeightGrams, null),
    notes: typeof input.notes === "string" ? input.notes.trim() : (input.notes ?? ""),
  } as Record<keyof LogInput, unknown>;
}

async function openBatch(farmId: string, batchId: unknown) {
  const batch =
    typeof batchId === "string" && Types.ObjectId.isValid(batchId)
      ? await BatchModel.findOne({ _id: batchId, farmId }).lean()
      : null;
  if (!batch) throw new HttpError(400, "invalid_log", "Choose a batch on the farm.", "batchId");
  if (batch.status === "closed")
    throw new HttpError(409, "closed", `${batch.code} is closed, so its logs can't change.`);
  return batch;
}

function check(values: Record<keyof LogInput, unknown>, context: Parameters<typeof validateLog>[1]) {
  const errors = validateLog(values, context);
  const [field] = Object.keys(errors) as (keyof LogInput)[];
  if (field) throw new HttpError(400, "invalid_log", errors[field]!, field);
  return values as unknown as LogInput;
}

const alreadyLogged = (date: string, id: string) =>
  new HttpError(409, "already_logged", `This batch already has a log for ${date}. Open it to make changes.`, "date", {
    id,
  });

/**
 * Records a batch's day. One log per batch per day: a second is refused with the existing log's id
 * so the phone can open it. `requestId` makes a resent log (from a phone that was offline) return
 * the one already saved instead of failing.
 */
export async function createLog(
  actor: CurrentUser,
  input: Record<string, unknown>,
  { requestId }: { requestId?: string } = {},
  today = lagosToday(),
): Promise<{ log: LogView; created: boolean }> {
  await connectDb();
  const id = typeof requestId === "string" && /^[\w-]{8,64}$/.test(requestId) ? requestId : null;
  if (id) {
    const sent = await DailyLogModel.findOne({ farmId: actor.farmId, clientRequestId: id }).lean();
    if (sent) return { log: view(sent as unknown as Doc), created: false };
  }
  const values = clean(input);
  const batch = await openBatch(actor.farmId, values.batchId);
  const totals = (await logTotals(actor.farmId, [String(batch._id)])).get(String(batch._id));
  const removed = totals ? totals.deaths + totals.culls + totals.sold : 0;
  const log = check(values, { today, placedOn: batch.placedOn, aliveBefore: placedCount(batch) - removed });

  const existing = await DailyLogModel.findOne({ farmId: actor.farmId, batchId: batch._id, date: log.date }).lean();
  if (existing) throw alreadyLogged(log.date, String(existing._id));
  try {
    const doc = await DailyLogModel.create({ ...log, farmId: actor.farmId, createdBy: actor.id, clientRequestId: id });
    return { log: view(doc.toObject() as unknown as Doc), created: true };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    // Sent twice at once, or another phone logged the same day a moment earlier.
    const sent = id ? await DailyLogModel.findOne({ farmId: actor.farmId, clientRequestId: id }).lean() : null;
    if (sent) return { log: view(sent as unknown as Doc), created: false };
    const other = await DailyLogModel.findOne({ farmId: actor.farmId, batchId: batch._id, date: log.date }).lean();
    throw alreadyLogged(log.date, String(other?._id ?? ""));
  }
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const log = Types.ObjectId.isValid(id) ? await DailyLogModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!log) throw new HttpError(404, "not_found", "That log doesn't exist any more.");
  return log;
}

/** Changes a log, from a form no older than the last save. The batch can't change; the day can. */
export async function updateLog(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  version: unknown,
  today = lagosToday(),
): Promise<LogView> {
  const doc = await load(actor, id);
  const values = clean({ ...input, batchId: String(doc.batchId) });
  const batch = await openBatch(actor.farmId, values.batchId);
  if (typeof version !== "number" || version !== doc.__v)
    throw new HttpError(409, "stale", "Someone changed this log while you were editing. Open it again.");
  const totals = (await logTotals(actor.farmId, [String(batch._id)], id)).get(String(batch._id));
  const removed = totals ? totals.deaths + totals.culls + totals.sold : 0;
  const log = check(values, { today, placedOn: batch.placedOn, aliveBefore: placedCount(batch) - removed });

  if (log.date !== doc.date) {
    const clash = await DailyLogModel.findOne({ farmId: actor.farmId, batchId: batch._id, date: log.date }).lean();
    if (clash) throw alreadyLogged(log.date, String(clash._id));
  }
  doc.set({ ...log, batchId: batch._id });
  try {
    await doc.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError")
      throw new HttpError(409, "stale", "Someone changed this log while you were editing. Open it again.");
    throw error;
  }
  return view(doc.toObject() as unknown as Doc);
}

/** Removes a log (kept, hidden and audited). Not on a closed batch. */
export async function deleteLog(actor: CurrentUser, id: string) {
  const doc = await load(actor, id);
  await openBatch(actor.farmId, String(doc.batchId));
  await doc.softDelete();
}
