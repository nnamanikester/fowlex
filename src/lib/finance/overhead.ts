import "server-only";

import { Types } from "mongoose";

import { spreadLogs } from "@/lib/batches/kpis";
import { placedCount } from "@/lib/batches/rules";
import { addDays } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { depreciationFor } from "@/lib/assets/rules";
import { COST_OF_EXPENSE } from "./batch-costs";
import { AssetModel } from "@/models/asset";
import { BatchModel } from "@/models/batch";
import { DailyLogModel } from "@/models/daily-log";
import { ExpenseModel } from "@/models/expense";
import { SalesOrderModel } from "@/models/sales-order";

/** `2026-11` → its first and last day. */
export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** The months from one date's to another's, inclusive: `2026-10`, `2026-11`… */
export function monthsBetween(from: string, to: string) {
  const months: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const end = to.slice(0, 7);
  for (;;) {
    const month = `${y}-${String(m).padStart(2, "0")}`;
    if (month > end) return months;
    months.push(month);
    m += 1;
    if (m > 12) [y, m] = [y + 1, 1];
  }
}

/**
 * A batch's bird-days from `from` to `to`: each day it was on the farm, the birds alive that
 * morning (placed, less every death, cull and sale on the days before).
 */
export function birdDays(
  batch: { placedOn: string; closedOn: string | null; placed: number },
  removals: { date: string; birds: number }[],
  from: string,
  to: string,
) {
  const start = batch.placedOn > from ? batch.placedOn : from;
  const end = batch.closedOn && batch.closedOn < to ? batch.closedOn : to;
  if (start > end) return 0;
  const gone = (day: string) => removals.reduce((n, r) => (r.date < day ? n + r.birds : n), 0);
  let total = 0;
  for (let day = start; day <= end; day = addDays(day, 1)) total += Math.max(0, batch.placed - gone(day));
  return total;
}

/**
 * Split `kobo` in proportion to each batch's bird-days. Shares are whole kobo and always add up
 * to the total: the kobo lost to rounding go to the largest remainders.
 */
export function splitByBirdDays(kobo: number, days: Map<string, number>) {
  const all = [...days.values()].reduce((a, b) => a + b, 0);
  const shares = new Map([...days.keys()].map((id) => [id, 0]));
  if (!all || !kobo) return shares;
  const exact = [...days].map(([id, d]) => ({ id, value: (kobo * d) / all }));
  for (const { id, value } of exact) shares.set(id, Math.floor(value));
  let left = kobo - [...shares.values()].reduce((a, b) => a + b, 0);
  for (const { id } of exact.sort((a, b) => (b.value % 1) - (a.value % 1) || a.id.localeCompare(b.id))) {
    if (left <= 0) break;
    shares.set(id, shares.get(id)! + 1);
    left -= 1;
  }
  return shares;
}

export type MonthOverhead = {
  month: string;
  /** Approved expenses not charged to a batch (rent, power, fuel, salaried staff…); stock bought counts as it's used. */
  expensesKobo: number;
  /** The month's depreciation of equipment. */
  depreciationKobo: number;
  totalKobo: number;
  batches: { batchId: string; code: string; birdDays: number; shareKobo: number }[];
  /** Shared costs from a month with no birds on the farm: nothing to share them with. */
  unsharedKobo: number;
};

/**
 * A month's shared costs and each batch's share of them, by bird-days. A month still running is
 * shared up to `today`.
 */
export async function monthOverhead(farmId: string, month: string, today: string): Promise<MonthOverhead> {
  await connectDb();
  const bounds = monthBounds(month);
  const to = bounds.to < today ? bounds.to : today;
  const farm = new Types.ObjectId(farmId);

  const [expenses, assets, batches] = await Promise.all([
    ExpenseModel.aggregate<{ kobo: number }>([
      {
        $match: {
          farmId: farm,
          batchId: null,
          approval: { $in: ["approved", null] },
          capital: { $ne: true },
          deletedAt: null,
          date: { $gte: bounds.from, $lte: bounds.to },
        },
      },
      { $group: { _id: null, kobo: { $sum: COST_OF_EXPENSE } } },
    ]),
    AssetModel.find(
      { farmId },
      { costKobo: 1, salvageKobo: 1, purchasedOn: 1, usefulLifeMonths: 1, disposedOn: 1 },
    ).lean(),
    BatchModel.find(
      { farmId, placedOn: { $lte: to }, $or: [{ closedOn: null }, { closedOn: { $gte: bounds.from } }] },
      { code: 1, placedOn: 1, closedOn: 1, delivered: 1, deadOnArrival: 1 },
    )
      .sort({ placedOn: 1, code: 1 })
      .lean(),
  ]);
  const expensesKobo = expenses[0]?.kobo ?? 0;
  const depreciationKobo = assets.reduce((n, a) => n + depreciationFor(a, month), 0);
  const totalKobo = expensesKobo + depreciationKobo;

  const removals = await removalsOf(
    farmId,
    batches.map((b) => b._id),
  );
  const days = new Map(
    batches.map((b) => [
      String(b._id),
      birdDays(
        { placedOn: b.placedOn, closedOn: b.closedOn ?? null, placed: placedCount(b) },
        removals.get(String(b._id)) ?? [],
        bounds.from,
        to,
      ),
    ]),
  );
  for (const [id, d] of days) if (!d) days.delete(id);
  const shares = splitByBirdDays(totalKobo, days);
  return {
    month,
    expensesKobo,
    depreciationKobo,
    totalKobo,
    batches: batches
      .filter((b) => days.has(String(b._id)))
      .map((b) => ({
        batchId: String(b._id),
        code: b.code,
        birdDays: Math.round(days.get(String(b._id))!),
        shareKobo: shares.get(String(b._id))!,
      })),
    unsharedKobo: days.size ? 0 : totalKobo,
  };
}

/** Each batch's share of the farm's shared costs, every month from placing to closing (or today). */
export async function batchOverhead(
  farmId: string,
  batch: { id: string; placedOn: string; closedOn: string | null },
  today: string,
) {
  const end = batch.closedOn && batch.closedOn < today ? batch.closedOn : today;
  const months = await Promise.all(monthsBetween(batch.placedOn, end).map((m) => monthOverhead(farmId, m, today)));
  return months.map((m) => ({
    month: m.month,
    shareKobo: m.batches.find((b) => b.batchId === batch.id)?.shareKobo ?? 0,
  }));
}

/** Birds leaving each batch, by day: deaths, culls and sales from logs, and deliveries on orders. */
async function removalsOf(farmId: string, ids: Types.ObjectId[]) {
  const out = new Map<string, { date: string; birds: number }[]>();
  if (!ids.length) return out;
  const [logs, orders] = await Promise.all([
    DailyLogModel.find(
      { farmId, batchId: { $in: ids } },
      { batchId: 1, date: 1, endDate: 1, deaths: 1, culls: 1, sold: 1, feedKg: 1, avgWeightGrams: 1 },
    ).lean(),
    SalesOrderModel.find(
      { farmId, status: { $in: ["delivered", "invoiced"] }, "lines.batchId": { $in: ids } },
      { deliveredOn: 1, deliveryDate: 1, lines: 1 },
    ).lean(),
  ]);
  const push = (id: string, date: string, birds: number) => {
    if (!birds) return;
    if (!out.has(id)) out.set(id, []);
    out.get(id)!.push({ date, birds });
  };
  for (const log of logs) {
    // A week's or month's log is spread evenly over its days.
    for (const day of spreadLogs([
      { ...log, endDate: log.endDate ?? null, avgWeightGrams: log.avgWeightGrams ?? null },
    ]))
      push(String(log.batchId), day.date, day.deaths + day.culls + day.sold);
  }
  for (const order of orders) {
    for (const line of order.lines) {
      if (line.batchId && ids.some((id) => id.equals(line.batchId!)))
        push(String(line.batchId), order.deliveredOn ?? order.deliveryDate, line.birds);
    }
  }
  return out;
}
