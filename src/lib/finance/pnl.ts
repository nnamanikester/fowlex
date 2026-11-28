import "server-only";

import { Types } from "mongoose";

import { liveBirds } from "@/lib/batches/bird-count";
import { placedCount } from "@/lib/batches/rules";
import { connectDb } from "@/lib/db";
import { logTotals } from "@/lib/logs/service";
import { lineAmount } from "@/lib/sales/rules";
import { costSheets, costSheetsIn, perUnit } from "./batch-costs";
import { batchOverhead, monthBounds, monthOverhead, monthsBetween } from "./overhead";
import { BatchModel } from "@/models/batch";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";
import { SalesOrderModel } from "@/models/sales-order";

/** Income as invoiced (accrual: when the invoice is sent) or as the money came in (cash). */
export const BASES = ["accrual", "cash"] as const;
export type Basis = (typeof BASES)[number];

export type Pnl = {
  incomeKobo: number;
  /** Chicks, feed, drugs, labour and the rest charged to batches, and the stock they used. */
  directKobo: number;
  /** Shared costs (rent, power, salaried staff) and equipment wear, shared out by bird-days. */
  sharedKobo: number;
  costKobo: number;
  profitKobo: number;
  /** Profit as a share of income, in percent to one decimal; null with no income. */
  marginPct: number | null;
};

export function pnl(incomeKobo: number, directKobo: number, sharedKobo: number): Pnl {
  const costKobo = directKobo + sharedKobo;
  const profitKobo = incomeKobo - costKobo;
  return {
    incomeKobo,
    directKobo,
    sharedKobo,
    costKobo,
    profitKobo,
    marginPct: incomeKobo ? Math.round((profitKobo / incomeKobo) * 1000) / 10 : null,
  };
}

export const addPnl = (rows: Pnl[]) =>
  pnl(
    rows.reduce((n, r) => n + r.incomeKobo, 0),
    rows.reduce((n, r) => n + r.directKobo, 0),
    rows.reduce((n, r) => n + r.sharedKobo, 0),
  );

type Range = { from: string; to: string };

/**
 * Income in a range, split by batch. Each invoice's income (its total less VAT) follows the order
 * lines it bills: a batch gets its lines' share. Delivery fees and lines typed by hand belong to
 * no batch. On a cash basis it's the payments received, split the same way.
 */
export async function income(farmId: string, range: Range, basis: Basis) {
  await connectDb();
  const farm = new Types.ObjectId(farmId);
  // Invoiced: sent, or still a draft but already paid towards (the customer has the birds).
  const invoiced = {
    farmId: farm,
    $or: [{ state: "sent" as const }, { state: "draft" as const, paidKobo: { $gt: 0 } }],
  };
  let parts: { invoiceId: string; kobo: number }[];
  if (basis === "accrual") {
    const invoices = await InvoiceModel.find(
      { ...invoiced, issueDate: { $gte: range.from, $lte: range.to } },
      { totalKobo: 1 },
    ).lean();
    parts = invoices.map((i) => ({ invoiceId: String(i._id), kobo: i.totalKobo }));
  } else {
    const payments = await PaymentModel.find(
      { farmId: farm, date: { $gte: range.from, $lte: range.to } },
      { invoiceId: 1, amountKobo: 1 },
    ).lean();
    parts = payments.map((p) => ({ invoiceId: String(p.invoiceId), kobo: p.amountKobo }));
  }
  const invoices = await InvoiceModel.find(
    { farmId: farm, _id: { $in: [...new Set(parts.map((p) => p.invoiceId))] } },
    { orderIds: 1, subtotalKobo: 1, discountKobo: 1, vatKobo: 1, totalKobo: 1, state: 1 },
  )
    .setOptions({ withDeleted: true })
    .lean();
  const orders = await SalesOrderModel.find(
    { farmId: farm, _id: { $in: invoices.flatMap((i) => i.orderIds) } },
    { lines: 1 },
  )
    .setOptions({ withDeleted: true })
    .lean();
  const linesOf = new Map(orders.map((o) => [String(o._id), o.lines]));
  const split = new Map(
    invoices.map((inv) => {
      // Each batch's lines, as a share of the invoice's total.
      const byBatch = new Map<string, number>();
      for (const id of inv.orderIds)
        for (const line of linesOf.get(String(id)) ?? [])
          if (line.batchId)
            byBatch.set(String(line.batchId), (byBatch.get(String(line.batchId)) ?? 0) + lineAmount(line));
      return [String(inv._id), { inv, byBatch }] as const;
    }),
  );

  const byBatch = new Map<string, number>();
  let totalKobo = 0;
  for (const part of parts) {
    const s = split.get(part.invoiceId);
    // A payment on a voided invoice, or one we can't find, isn't income.
    if (!s || s.inv.state === "void" || !s.inv.totalKobo) continue;
    // The part of the invoice this is (all of it when accrued, a payment's share when cash).
    const part_ = part.kobo / s.inv.totalKobo;
    totalKobo += Math.round(part_ * (s.inv.totalKobo - s.inv.vatKobo));
    // A batch's lines, less their share of any discount.
    // (An invoice with batch lines has a subtotal.)
    const afterDiscount = (s.inv.subtotalKobo - s.inv.discountKobo) / s.inv.subtotalKobo;
    for (const [batchId, lines] of s.byBatch)
      byBatch.set(batchId, (byBatch.get(batchId) ?? 0) + lines * afterDiscount * part_);
  }
  for (const [id, kobo] of byBatch) byBatch.set(id, Math.round(kobo));
  const batched = [...byBatch.values()].reduce((a, b) => a + b, 0);
  return { totalKobo, byBatch, unbatchedKobo: totalKobo - batched };
}

export type BatchRow = Pnl & { batchId: string; code: string };
export type MonthPnl = Pnl & {
  month: string;
  batches: BatchRow[];
  /** Income from no batch (delivery fees, lines typed by hand) and shared costs with no batch to go to. */
  unbatched: Pnl;
};

/** One month: each batch's profit, and what belongs to no batch. They add up to the month. */
export async function monthPnl(farmId: string, month: string, basis: Basis, today: string): Promise<MonthPnl> {
  const bounds = monthBounds(month);
  const range = { from: bounds.from, to: bounds.to < today ? bounds.to : today };
  const [money, direct, overhead] = await Promise.all([
    income(farmId, range, basis),
    costSheetsIn(farmId, range),
    monthOverhead(farmId, month, today),
  ]);
  const ids = new Set([...money.byBatch.keys(), ...direct.keys(), ...overhead.batches.map((b) => b.batchId)]);
  const codes = new Map(
    (
      await BatchModel.find({ farmId, _id: { $in: [...ids] } }, { code: 1, placedOn: 1 })
        .setOptions({ withDeleted: true })
        .lean()
    ).map((b) => [String(b._id), b]),
  );
  const batches = [...ids]
    .filter((id) => codes.has(id))
    // Batch codes run in the order they were placed.
    .sort((a, b) => codes.get(a)!.code.localeCompare(codes.get(b)!.code))
    .map((id) => ({
      batchId: id,
      code: codes.get(id)!.code,
      ...pnl(
        money.byBatch.get(id) ?? 0,
        direct.get(id)?.totalKobo ?? 0,
        overhead.batches.find((b) => b.batchId === id)?.shareKobo ?? 0,
      ),
    }));
  const unbatched = pnl(money.unbatchedKobo, 0, overhead.unsharedKobo);
  return { month, ...addPnl([...batches, unbatched]), batches, unbatched };
}

/** A year, month by month up to today. The year is the sum of its months. */
export async function yearPnl(farmId: string, year: number, basis: Basis, today: string) {
  const last = `${year}-12-31` < today ? `${year}-12-31` : today;
  const months =
    `${year}-01-01` > today
      ? []
      : await Promise.all(monthsBetween(`${year}-01-01`, last).map((m) => monthPnl(farmId, m, basis, today)));
  return { year, ...addPnl(months), months };
}

export type BatchPnl = Pnl & {
  batchId: string;
  code: string;
  status: string;
  placedOn: string;
  closedOn: string | null;
  placed: number;
  liveBirds: number;
  perBirdKobo: number | null;
  perKgKobo: number | null;
};

/** Every batch's profit over its whole life, with its cost per bird and per kg. */
export async function batchesPnl(farmId: string, basis: Basis, today: string): Promise<BatchPnl[]> {
  await connectDb();
  const batches = await BatchModel.find({ farmId }).sort({ placedOn: -1, code: -1 }).lean();
  if (!batches.length) return [];
  const ids = batches.map((b) => String(b._id));
  const [money, direct, totals, shares] = await Promise.all([
    income(farmId, { from: "0000-01-01", to: today }, basis),
    costSheets(farmId, ids),
    logTotals(farmId, ids),
    Promise.all(
      batches.map((b) =>
        batchOverhead(farmId, { id: String(b._id), placedOn: b.placedOn, closedOn: b.closedOn ?? null }, today),
      ),
    ),
  ]);
  return batches.map((b, i) => {
    const id = String(b._id);
    const t = totals.get(id);
    const placed = placedCount(b);
    const counts = { placed, deaths: t?.deaths ?? 0, culls: t?.culls ?? 0, sold: t?.sold ?? 0 };
    const p = pnl(
      money.byBatch.get(id) ?? 0,
      direct.get(id)!.totalKobo,
      shares[i].reduce((n, m) => n + m.shareKobo, 0),
    );
    const unit = perUnit(
      { totalKobo: p.costKobo },
      {
        placed,
        survivors: placed - counts.deaths - counts.culls,
        weightGrams: t?.lastWeight?.grams ?? null,
      },
    );
    return {
      batchId: id,
      code: b.code,
      status: b.status,
      placedOn: b.placedOn,
      closedOn: b.closedOn ?? null,
      placed,
      liveBirds: liveBirds(counts),
      ...p,
      perBirdKobo: unit.perSurvivorKobo,
      perKgKobo: unit.perKgKobo,
    };
  });
}
