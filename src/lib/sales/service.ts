import "server-only";

import { Types } from "mongoose";

import { lineAmount, type OrderInput, type OrderLine, type OrderStatus, orderTotal, validateOrder } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { listBatches } from "@/lib/batches/service";
import { contractFor } from "@/lib/contracts/service";
import type { Pricing } from "@/lib/contracts/rules";
import { isISODate, today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { readSettings } from "@/lib/settings/service";
import { assertOrderUnpaid, dropOrderInvoice, syncOrderInvoice } from "@/lib/invoices/service";
import { farmPrices } from "@/lib/shop/service";
import { BatchModel } from "@/models/batch";
import { ContractModel } from "@/models/contract";
import { nextSequence } from "@/models/counter";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { SalesOrderModel } from "@/models/sales-order";

export type OrderView = OrderInput & {
  id: string;
  version: number;
  number: string;
  customerName: string;
  contract: { id: string; number: string } | null;
  status: OrderStatus;
  totalKobo: number;
  deliveredOn: string | null;
  invoiceId: string | null;
  /** Money is paid on its invoice, or its invoice bills other orders too: it can't be changed here. */
  locked: boolean;
  /** Each line's batch code, for showing. */
  batchCodes: Record<string, string>;
  /** Booked by the farm, or by the customer on the order page (with how to reach them). */
  source: "farm" | "online";
  contact: { name: string; phone: string; email: string; business: string; delivery: boolean; address: string } | null;
};

/** As stored: every field has a default, so nothing is missing. */
type Doc = {
  _id: unknown;
  __v: number;
  number: string;
  customerId: unknown;
  contractId?: unknown;
  deliveryDate: string;
  lines: (Omit<OrderLine, "batchId"> & { batchId: unknown })[];
  deliveryKobo: number;
  totalKobo: number;
  notes: string;
  status: OrderStatus;
  deliveredOn?: string | null;
  invoiceId?: unknown;
  source: "farm" | "online";
  contact: OrderView["contact"];
};

type Names = {
  customers: Map<string, string>;
  batches: Map<string, string>;
  contracts: Map<string, string>;
  /** Invoices with money paid on them, or billing more than one order. */
  locked: Set<string>;
};

const view = (o: Doc, names: Names): OrderView => ({
  id: String(o._id),
  version: o.__v,
  number: o.number,
  customerId: String(o.customerId),
  customerName: names.customers.get(String(o.customerId)) ?? "A removed customer",
  contract: o.contractId ? { id: String(o.contractId), number: names.contracts.get(String(o.contractId)) ?? "" } : null,
  deliveryDate: o.deliveryDate,
  lines: o.lines.map((l) => ({
    batchId: String(l.batchId),
    birds: l.birds,
    weightGrams: l.weightGrams,
    weighed: l.weighed !== false,
    priceKobo: l.priceKobo,
    pricing: l.pricing,
  })),
  deliveryKobo: o.deliveryKobo,
  totalKobo: o.totalKobo,
  notes: o.notes,
  status: o.status,
  deliveredOn: o.deliveredOn ?? null,
  invoiceId: o.invoiceId ? String(o.invoiceId) : null,
  locked: o.status === "invoiced" || (!!o.invoiceId && names.locked.has(String(o.invoiceId))),
  batchCodes: Object.fromEntries(o.lines.map((l) => [String(l.batchId), names.batches.get(String(l.batchId)) ?? "?"])),
  source: o.source,
  contact: o.contact,
});

async function namesFor(farmId: string, docs: Doc[]): Promise<Names> {
  const ids = (key: (d: Doc) => unknown[]) => [...new Set(docs.flatMap(key).filter(Boolean).map(String))];
  const [customers, batches, contracts, invoices] = await Promise.all([
    CustomerModel.find({ farmId, _id: { $in: ids((d) => [d.customerId]) } }, { name: 1 })
      .setOptions({ withDeleted: true })
      .lean(),
    BatchModel.find({ farmId, _id: { $in: ids((d) => d.lines.map((l) => l.batchId)) } }, { code: 1 })
      .setOptions({ withDeleted: true })
      .lean(),
    ContractModel.find({ farmId, _id: { $in: ids((d) => [d.contractId]) } }, { number: 1 })
      .setOptions({ withDeleted: true })
      .lean(),
    InvoiceModel.find(
      { farmId, _id: { $in: ids((d) => [d.invoiceId]) }, state: { $ne: "void" } },
      { paidKobo: 1, orderIds: 1 },
    ).lean(),
  ]);
  return {
    customers: new Map(customers.map((c) => [String(c._id), c.name])),
    batches: new Map(batches.map((b) => [String(b._id), b.code])),
    contracts: new Map(contracts.map((c) => [String(c._id), c.number])),
    locked: new Set(invoices.filter((i) => i.paidKobo > 0 || i.orderIds.length > 1).map((i) => String(i._id))),
  };
}

const views = async (farmId: string, docs: Doc[]) => {
  const names = await namesFor(farmId, docs);
  return docs.map((d) => view(d, names));
};

/** Orders, soonest delivery first for those still to deliver, then newest; filtered by customer or batch. */
export async function listOrders(
  farmId: string,
  { customerId, batchId }: { customerId?: string; batchId?: string } = {},
): Promise<OrderView[]> {
  await connectDb();
  if ((customerId && !Types.ObjectId.isValid(customerId)) || (batchId && !Types.ObjectId.isValid(batchId))) return [];
  const docs = (await SalesOrderModel.find({
    farmId,
    ...(customerId && { customerId }),
    ...(batchId && { "lines.batchId": batchId }),
  })
    .sort({ deliveryDate: -1, number: -1 })
    .lean()) as unknown as Doc[];
  const pending = docs
    .filter((d) => d.status === "pending")
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  return views(farmId, [...pending, ...docs.filter((d) => d.status !== "pending")]);
}

export type Price = {
  pricing: Pricing;
  /** Null when there's no contract and no default price per kg in Settings. */
  priceKobo: number | null;
  contract: { id: string; number: string } | null;
};

/** What a customer pays on a day: their running contract's price, or the farm's usual price. */
export async function priceFor(farmId: string, customerId: string, day: string): Promise<Price> {
  const contract = await contractFor(farmId, customerId, day);
  if (contract)
    return {
      pricing: contract.pricing,
      priceKobo: contract.priceKobo,
      contract: { id: contract.id, number: contract.number },
    };
  // The farm's usual price, the first on its list (or its price per kg, from Settings).
  const [usual] = await farmPrices(farmId);
  if (usual) return { pricing: usual.pricing, priceKobo: usual.priceKobo, contract: null };
  return { pricing: "perKg", priceKobo: (await readSettings(farmId)).defaultPricePerKgKobo ?? null, contract: null };
}

/**
 * What a customer owes or has coming: orders not yet on an invoice (to deliver or delivered),
 * and what's left to pay on their invoices (drafts too: the birds have gone).
 */
export async function outstanding(farmId: string, customerId: string, exceptOrderId?: unknown) {
  await connectDb();
  const match = { farmId: new Types.ObjectId(farmId), customerId: new Types.ObjectId(customerId) };
  const [[orders], [invoices]] = await Promise.all([
    SalesOrderModel.aggregate<{ kobo: number }>([
      {
        $match: {
          ...match,
          status: { $in: ["pending", "delivered"] },
          // An order with its invoice is counted once, in what's left on the invoice.
          invoiceId: null,
          ...(exceptOrderId ? { _id: { $ne: exceptOrderId } } : {}),
        },
      },
      { $group: { _id: null, kobo: { $sum: "$totalKobo" } } },
    ]),
    InvoiceModel.aggregate<{ kobo: number }>([
      {
        $match: {
          ...match,
          state: { $ne: "void" },
          // The order being changed is counted at its new total: its own invoice is left out.
          ...(exceptOrderId ? { orderIds: { $ne: [exceptOrderId] } } : {}),
        },
      },
      { $group: { _id: null, kobo: { $sum: { $max: [0, { $subtract: ["$totalKobo", "$paidKobo"] }] } } } },
    ]),
  ]);
  return (orders?.kobo ?? 0) + (invoices?.kobo ?? 0);
}

export type Quote = Price & { owedKobo: number; limitKobo: number | null; termsDays: number };

/** For the order form: the customer's price on the day, and how much they already owe against their limit. */
export async function quote(farmId: string, customerId: string, day: string): Promise<Quote> {
  await connectDb();
  const customer = Types.ObjectId.isValid(customerId)
    ? await CustomerModel.findOne({ _id: customerId, farmId }, { creditLimitKobo: 1, termsDays: 1 }).lean()
    : null;
  if (!customer) throw new HttpError(404, "not_found", "That customer isn't on the list any more.");
  if (!isISODate(day)) throw new HttpError(400, "invalid_order", "Choose the delivery day.", "deliveryDate");
  const [price, owedKobo] = await Promise.all([priceFor(farmId, customerId, day), outstanding(farmId, customerId)]);
  return { ...price, owedKobo, limitKobo: customer.creditLimitKobo ?? null, termsDays: customer.termsDays };
}

const credit = (name: string, owed: number, adding: number, limit: number) =>
  new HttpError(
    409,
    "over_credit",
    `${name} would owe ${formatNaira(owed + adding)}, over their limit of ${formatNaira(limit)}. Save anyway only if you've agreed it.`,
    undefined,
    { owedKobo: owed, addingKobo: adding, limitKobo: limit },
  );

/**
 * Cleans an order and prices it: on a contract's days every line takes the contract's price (it
 * can't be typed over); otherwise each line keeps the price given.
 */
async function prepare(farmId: string, input: Record<string, unknown>) {
  const lines = Array.isArray(input.lines) ? (input.lines as Record<string, unknown>[]) : input.lines;
  const values = {
    customerId: input.customerId,
    deliveryDate: input.deliveryDate,
    deliveryKobo: input.deliveryKobo ?? 0,
    notes: typeof input.notes === "string" ? input.notes.trim() : (input.notes ?? ""),
    lines: Array.isArray(lines)
      ? lines.map((l) => ({
          batchId: l?.batchId,
          birds: l?.birds,
          weightGrams: l?.weightGrams ?? 0,
          priceKobo: l?.priceKobo,
          pricing: l?.pricing ?? "perKg",
          // An estimate passed back (not weighed) is worked out again, never taken as a weighing.
          ...(l?.weighed === false && { weighed: false }),
        }))
      : lines,
  };
  // A contract decides the price before the price itself is checked.
  const customerOk = typeof values.customerId === "string" && Types.ObjectId.isValid(values.customerId);
  const dayOk = typeof values.deliveryDate === "string" && isISODate(values.deliveryDate);
  const price =
    customerOk && dayOk ? await priceFor(farmId, values.customerId as string, values.deliveryDate as string) : null;
  if (price?.contract && Array.isArray(values.lines))
    values.lines = values.lines.map((l) => ({ ...l, pricing: price.pricing, priceKobo: price.priceKobo }));
  const errors = validateOrder(values);
  const [field] = Object.keys(errors);
  if (field) throw new HttpError(400, "invalid_order", errors[field as keyof typeof errors]!, field);
  const v = values as OrderInput;
  await estimateWeights(farmId, v.lines);
  const customer = await CustomerModel.findOne(
    { _id: v.customerId, farmId },
    { name: 1, status: 1, creditLimitKobo: 1 },
  ).lean();
  if (!customer || customer.status !== "active")
    throw new HttpError(400, "invalid_order", "Choose a customer on the list.", "customerId");
  const batchIds = [...new Set(v.lines.map((l) => l.batchId))];
  const batches = await BatchModel.find({ farmId, _id: { $in: batchIds } }, { code: 1, status: 1 }).lean();
  v.lines.forEach((l, i) => {
    const b = batches.find((x) => String(x._id) === l.batchId);
    if (!b) throw new HttpError(400, "invalid_order", "Choose a batch on the farm.", `lines.${i}.batchId`);
    if (b.status === "closed")
      throw new HttpError(409, "closed", `${b.code} is closed: its birds are all accounted for.`, `lines.${i}.batchId`);
  });
  return { values: v, contractId: price?.contract?.id ?? null, customer };
}

/**
 * Weighing is never required: a per-kg line with no weight is priced on its batch's weight (the
 * last weighing, or the weight it's grown to) times the birds, marked as not weighed. A weight
 * given is a weighing.
 */
async function estimateWeights(farmId: string, lines: OrderLine[]) {
  const unweighed = lines.filter((l) => !(l.weightGrams > 0) || l.weighed === false);
  for (const l of lines) l.weighed = !unweighed.includes(l);
  if (!unweighed.some((l) => l.pricing === "perKg")) return;
  const batches = new Map((await listBatches(farmId, lagosToday())).map((b) => [b.id, b]));
  for (const l of unweighed)
    if (l.pricing === "perKg") {
      const b = batches.get(l.batchId);
      const each = b ? (b.totals.lastWeight?.grams ?? b.targetWeightGrams) : 0;
      l.weightGrams = Math.round(each * l.birds);
    }
}

function checkCredit(
  customer: { name: string; creditLimitKobo?: number | null },
  owed: number,
  total: number,
  confirm: unknown,
) {
  const limit = customer.creditLimitKobo;
  if (confirm !== true && limit !== null && limit !== undefined && owed + total > limit)
    throw credit(customer.name, owed, total, limit);
}

/**
 * Books an order, and its invoice with it (a draft, not sent): one step, nothing to redo later.
 * Over the customer's limit it's refused with the figures, unless `confirm` says it was agreed.
 */
export async function createOrder(actor: CurrentUser, input: Record<string, unknown>) {
  await connectDb();
  const { values, contractId, customer } = await prepare(actor.farmId, input);
  const total = orderTotal(values);
  checkCredit(customer, await outstanding(actor.farmId, values.customerId), total, input.confirm);
  const year = values.deliveryDate.slice(0, 4);
  const seq = await nextSequence(actor.farmId, `order:${year}`);
  const doc = await SalesOrderModel.create({
    ...values,
    contractId,
    totalKobo: total,
    number: `SO-${year}-${String(seq).padStart(4, "0")}`,
    farmId: actor.farmId,
    createdBy: actor.id,
  });
  await syncOrderInvoice(actor.farmId, actor.id, doc._id);
  return fresh(actor.farmId, doc._id);
}

/** The order as it is now (its invoice may have just been made). */
async function fresh(farmId: string, id: unknown) {
  const doc = (await SalesOrderModel.findById(id).lean())!;
  return (await views(farmId, [doc as unknown as Doc]))[0];
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id) ? await SalesOrderModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!doc) throw new HttpError(404, "not_found", "That order isn't here any more.");
  return doc;
}

const stale = () =>
  new HttpError(409, "stale", "Someone changed this order while you were working on it. Open it again.");

async function saveDoc(doc: InstanceType<typeof SalesOrderModel>) {
  try {
    await doc.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
}

/**
 * Changes an order, delivered or not, until money is paid on its invoice (the invoice follows):
 * the birds, their weight once weighed, the price, the day. A delivered order can't take more
 * birds than its batches have, counting its own.
 */
export async function updateOrder(actor: CurrentUser, id: string, input: Record<string, unknown>, version: unknown) {
  const doc = await load(actor, id);
  if (typeof version !== "number" || version !== doc.__v) throw stale();
  if (doc.status === "cancelled" || doc.status === "invoiced")
    throw new HttpError(
      409,
      "not_pending",
      doc.status === "cancelled"
        ? `${doc.number} was cancelled, so it stays as it was.`
        : `${doc.number} is on an invoice with other orders: change it there.`,
    );
  await assertOrderUnpaid(actor.farmId, doc);
  const delivered = doc.status === "delivered";
  const { values, contractId, customer } = await prepare(actor.farmId, {
    ...input,
    customerId: String(doc.customerId),
    ...(delivered && { deliveryDate: doc.deliveredOn ?? doc.deliveryDate }),
  });
  if (delivered) await assertBirds(actor.farmId, values.lines, doc.lines, values.deliveryDate);
  const total = orderTotal(values);
  checkCredit(customer, await outstanding(actor.farmId, values.customerId, doc._id), total, input.confirm);
  doc.set({ ...values, contractId, totalKobo: total });
  await saveDoc(doc);
  await syncOrderInvoice(actor.farmId, actor.id, doc._id);
  return fresh(actor.farmId, doc._id);
}

/** No batch gives more birds than it has; `own` (the order's birds already out) count as there. */
async function assertBirds(farmId: string, lines: OrderLine[], own: { batchId: unknown; birds: number }[], on: string) {
  const batches = new Map((await listBatches(farmId, lagosToday())).map((b) => [b.id, b]));
  const back = new Map<string, number>();
  for (const l of own) back.set(String(l.batchId), (back.get(String(l.batchId)) ?? 0) + l.birds);
  const wanted = new Map<string, number>();
  for (const l of lines) wanted.set(l.batchId, (wanted.get(l.batchId) ?? 0) + l.birds);
  for (const [batchId, birds] of wanted) {
    const b = batches.get(batchId)!;
    if (b.placedOn > on)
      throw new HttpError(409, "not_placed", `${b.code}'s chicks weren't placed by then.`, "deliveredOn");
    const has = b.liveBirds + (back.get(batchId) ?? 0);
    if (birds > has)
      throw new HttpError(
        409,
        "not_enough_birds",
        `${b.code} has ${has.toLocaleString("en-NG")} birds left, not ${birds.toLocaleString("en-NG")}.`,
        `lines.${lines.findIndex((l) => l.batchId === batchId)}.birds`,
      );
  }
  return wanted;
}

/**
 * The birds are handed over: with the birds and weight as delivered (a per-kg line must be
 * weighed), priced by the contract running on the day they went. The birds leave their batches'
 * live count, so no batch can deliver more than it has; a growing batch moves to selling.
 */
export async function deliverOrder(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  version: unknown,
  today = lagosToday(),
) {
  const doc = await load(actor, id);
  if (typeof version !== "number" || version !== doc.__v) throw stale();
  if (doc.status !== "pending")
    throw new HttpError(409, "not_pending", `${doc.number} is ${doc.status}, not waiting to be delivered.`);
  await assertOrderUnpaid(actor.farmId, doc);
  const on = input.deliveredOn === undefined || input.deliveredOn === "" ? today : input.deliveredOn;
  if (typeof on !== "string" || !isISODate(on) || on > today)
    throw new HttpError(400, "invalid_order", "Choose the day it was delivered: today or before.", "deliveredOn");
  const { values, contractId, customer } = await prepare(actor.farmId, {
    customerId: String(doc.customerId),
    deliveryDate: on,
    deliveryKobo: input.deliveryKobo ?? doc.deliveryKobo,
    notes: input.notes ?? doc.notes,
    lines:
      input.lines ??
      doc.lines.map((l) => ({
        batchId: String(l.batchId),
        birds: l.birds,
        weightGrams: l.weightGrams,
        priceKobo: l.priceKobo,
        pricing: l.pricing,
        weighed: l.weighed,
      })),
  });
  const wanted = await assertBirds(actor.farmId, values.lines, [], on);
  const total = orderTotal(values);
  checkCredit(customer, await outstanding(actor.farmId, values.customerId, doc._id), total, input.confirm);
  doc.set({ ...values, contractId, totalKobo: total, status: "delivered", deliveredOn: on });
  await saveDoc(doc);
  // Delivering birds means the batch is selling.
  await BatchModel.updateMany(
    { farmId: actor.farmId, _id: { $in: [...wanted.keys()] }, status: "active" },
    { $set: { status: "selling" } },
  );
  await syncOrderInvoice(actor.farmId, actor.id, doc._id);
  return fresh(actor.farmId, doc._id);
}

/** Calls off an order still to deliver; it stays on record as cancelled. */
export async function cancelOrder(actor: CurrentUser, id: string) {
  const doc = await load(actor, id);
  if (doc.status !== "pending")
    throw new HttpError(
      409,
      "not_pending",
      `${doc.number} was ${doc.status === "cancelled" ? "cancelled already" : "delivered"}.`,
    );
  await assertOrderUnpaid(actor.farmId, doc);
  doc.status = "cancelled";
  await doc.save();
  await dropOrderInvoice(actor.farmId, doc, `${doc.number} was cancelled`);
  return (await views(actor.farmId, [doc.toObject() as unknown as Doc]))[0];
}

/**
 * Deletes an order made by mistake, delivered or not, until money is paid on its invoice. Its
 * invoice goes with it (removed, or voided if the customer was sent it), and whatever it changed
 * comes back: delivered birds count as live again, the customer owes nothing for it, a contract's
 * record no longer counts it. Kept hidden in the audit trail.
 */
export async function deleteOrder(actor: CurrentUser, id: string) {
  const doc = await load(actor, id);
  if (doc.status === "invoiced")
    throw new HttpError(
      409,
      "on_invoice",
      `${doc.number} is on an invoice with other orders: take it off there first.`,
    );
  await assertOrderUnpaid(actor.farmId, doc);
  await dropOrderInvoice(actor.farmId, doc, `${doc.number} was deleted`);
  await doc.softDelete();
}

/** Each line's amount and the total, for showing a delivered order. */
export const amounts = (o: Pick<OrderView, "lines" | "deliveryKobo">) => ({
  lines: o.lines.map(lineAmount),
  totalKobo: orderTotal(o),
});
