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

type Names = { customers: Map<string, string>; batches: Map<string, string>; contracts: Map<string, string> };

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
    priceKobo: l.priceKobo,
    pricing: l.pricing,
  })),
  deliveryKobo: o.deliveryKobo,
  totalKobo: o.totalKobo,
  notes: o.notes,
  status: o.status,
  deliveredOn: o.deliveredOn ?? null,
  invoiceId: o.invoiceId ? String(o.invoiceId) : null,
  batchCodes: Object.fromEntries(o.lines.map((l) => [String(l.batchId), names.batches.get(String(l.batchId)) ?? "?"])),
  source: o.source,
  contact: o.contact,
});

async function namesFor(farmId: string, docs: Doc[]): Promise<Names> {
  const ids = (key: (d: Doc) => unknown[]) => [...new Set(docs.flatMap(key).filter(Boolean).map(String))];
  const [customers, batches, contracts] = await Promise.all([
    CustomerModel.find({ farmId, _id: { $in: ids((d) => [d.customerId]) } }, { name: 1 })
      .setOptions({ withDeleted: true })
      .lean(),
    BatchModel.find({ farmId, _id: { $in: ids((d) => d.lines.map((l) => l.batchId)) } }, { code: 1 })
      .setOptions({ withDeleted: true })
      .lean(),
    ContractModel.find({ farmId, _id: { $in: ids((d) => [d.contractId]) } }, { number: 1 })
      .setOptions({ withDeleted: true })
      .lean(),
  ]);
  return {
    customers: new Map(customers.map((c) => [String(c._id), c.name])),
    batches: new Map(batches.map((b) => [String(b._id), b.code])),
    contracts: new Map(contracts.map((c) => [String(c._id), c.number])),
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

/** What a customer pays on a day: their running contract's price, or the farm's price per kg. */
export async function priceFor(farmId: string, customerId: string, day: string): Promise<Price> {
  const contract = await contractFor(farmId, customerId, day);
  if (contract)
    return {
      pricing: contract.pricing,
      priceKobo: contract.priceKobo,
      contract: { id: contract.id, number: contract.number },
    };
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
          ...(exceptOrderId ? { _id: { $ne: exceptOrderId } } : {}),
        },
      },
      { $group: { _id: null, kobo: { $sum: "$totalKobo" } } },
    ]),
    InvoiceModel.aggregate<{ kobo: number }>([
      { $match: { ...match, state: { $ne: "void" } } },
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
async function prepare(farmId: string, input: Record<string, unknown>, opts: { delivered?: boolean } = {}) {
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
  const errors = validateOrder(values, opts);
  const [field] = Object.keys(errors);
  if (field) throw new HttpError(400, "invalid_order", errors[field as keyof typeof errors]!, field);
  const v = values as OrderInput;
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

/** Books an order. Over the customer's limit it's refused with the figures, unless `confirm` says it was agreed. */
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
  return (await views(actor.farmId, [doc.toObject() as unknown as Doc]))[0];
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

/** Changes an order still to deliver, from a form no older than the last save. */
export async function updateOrder(actor: CurrentUser, id: string, input: Record<string, unknown>, version: unknown) {
  const doc = await load(actor, id);
  if (typeof version !== "number" || version !== doc.__v) throw stale();
  if (doc.status !== "pending")
    throw new HttpError(409, "not_pending", `${doc.number} is ${doc.status}, so it can't be changed.`);
  const { values, contractId, customer } = await prepare(actor.farmId, {
    ...input,
    customerId: String(doc.customerId),
  });
  const total = orderTotal(values);
  checkCredit(customer, await outstanding(actor.farmId, values.customerId, doc._id), total, input.confirm);
  doc.set({ ...values, contractId, totalKobo: total });
  await saveDoc(doc);
  return (await views(actor.farmId, [doc.toObject() as unknown as Doc]))[0];
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
  const on = input.deliveredOn === undefined || input.deliveredOn === "" ? today : input.deliveredOn;
  if (typeof on !== "string" || !isISODate(on) || on > today)
    throw new HttpError(400, "invalid_order", "Choose the day it was delivered: today or before.", "deliveredOn");
  const { values, contractId, customer } = await prepare(
    actor.farmId,
    {
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
        })),
    },
    { delivered: true },
  );
  const batches = new Map((await listBatches(actor.farmId, today)).map((b) => [b.id, b]));
  const wanted = new Map<string, number>();
  for (const l of values.lines) wanted.set(l.batchId, (wanted.get(l.batchId) ?? 0) + l.birds);
  for (const [batchId, birds] of wanted) {
    const b = batches.get(batchId)!;
    if (b.placedOn > on)
      throw new HttpError(409, "not_placed", `${b.code}'s chicks weren't placed by then.`, "deliveredOn");
    if (birds > b.liveBirds)
      throw new HttpError(
        409,
        "not_enough_birds",
        `${b.code} has ${b.liveBirds.toLocaleString("en-NG")} birds left, not ${birds.toLocaleString("en-NG")}.`,
        `lines.${values.lines.findIndex((l) => l.batchId === batchId)}.birds`,
      );
  }
  const total = orderTotal(values);
  checkCredit(customer, await outstanding(actor.farmId, values.customerId, doc._id), total, input.confirm);
  doc.set({ ...values, contractId, totalKobo: total, status: "delivered", deliveredOn: on });
  await saveDoc(doc);
  // Delivering birds means the batch is selling.
  await BatchModel.updateMany(
    { farmId: actor.farmId, _id: { $in: [...wanted.keys()] }, status: "active" },
    { $set: { status: "selling" } },
  );
  return (await views(actor.farmId, [doc.toObject() as unknown as Doc]))[0];
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
  doc.status = "cancelled";
  await doc.save();
  return (await views(actor.farmId, [doc.toObject() as unknown as Doc]))[0];
}

/** Each line's amount and the total, for showing a delivered order. */
export const amounts = (o: Pick<OrderView, "lines" | "deliveryKobo">) => ({
  lines: o.lines.map(lineAmount),
  totalKobo: orderTotal(o),
});
