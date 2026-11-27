import "server-only";

import { Types } from "mongoose";

import {
  type ContractInput,
  type ContractStatus,
  contractStatus,
  endAfter,
  ENDING_WARNING_DAYS,
  LIMITS,
  type StoredStatus,
  type Terms,
  validateContract,
  validateTerms,
} from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { addDays, formatRange, isISODate, today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatNaira } from "@/lib/money";
import { nextSequence } from "@/models/counter";
import { ContractModel, ContractTemplateModel } from "@/models/contract";
import { CustomerModel } from "@/models/customer";
import { UserModel } from "@/models/user";

export type ContractView = ContractInput & {
  id: string;
  version: number;
  number: string;
  customerName: string;
  status: ContractStatus;
  terminatedOn: string | null;
};

/** As stored: every field has a default, so nothing is missing. */
type Doc = Omit<ContractInput, "customerId"> & {
  _id: unknown;
  __v: number;
  number: string;
  customerId: unknown;
  status: StoredStatus;
  terminatedOn?: string | null;
};

const view = (c: Doc, names: Map<string, string>, today: string): ContractView => ({
  id: String(c._id),
  version: c.__v,
  number: c.number,
  customerId: String(c.customerId),
  customerName: names.get(String(c.customerId)) ?? "A removed customer",
  pricing: c.pricing,
  priceKobo: c.priceKobo,
  minBirds: c.minBirds ?? null,
  minPer: c.minPer,
  deliveryEvery: c.deliveryEvery,
  termsDays: c.termsDays,
  startDate: c.startDate,
  endDate: c.endDate,
  reviewOn: c.reviewOn ?? null,
  notes: c.notes,
  document: c.document ? { url: c.document.url, name: c.document.name } : null,
  status: contractStatus(c, today),
  terminatedOn: c.terminatedOn ?? null,
});

async function customerNames(farmId: string) {
  const customers = await CustomerModel.find({ farmId }, { name: 1 }).setOptions({ withDeleted: true }).lean();
  return new Map(customers.map((c) => [String(c._id), c.name]));
}

/** Contracts, newest start first; one customer's when `customerId` is given. */
export async function listContracts(
  farmId: string,
  { customerId, today = lagosToday() }: { customerId?: string; today?: string } = {},
): Promise<ContractView[]> {
  await connectDb();
  if (customerId !== undefined && !Types.ObjectId.isValid(customerId)) return [];
  const [docs, names] = await Promise.all([
    ContractModel.find({ farmId, ...(customerId && { customerId }) })
      .sort({ startDate: -1, number: -1 })
      .lean(),
    customerNames(farmId),
  ]);
  return docs.map((d) => view(d as unknown as Doc, names, today));
}

/**
 * The contract that sets a customer's price on a day: active and running then. There is at most
 * one, since two active contracts for a customer can't overlap.
 */
export async function contractFor(farmId: string, customerId: string, day: string) {
  await connectDb();
  if (!Types.ObjectId.isValid(customerId)) return null;
  const doc = await ContractModel.findOne({
    farmId,
    customerId,
    status: "active",
    startDate: { $lte: day },
    endDate: { $gte: day },
  }).lean();
  return doc ? view(doc as unknown as Doc, await customerNames(farmId), day) : null;
}

function clean(input: Record<string, unknown>) {
  const values = {
    customerId: input.customerId,
    pricing: input.pricing,
    priceKobo: input.priceKobo,
    minBirds: input.minBirds === undefined || input.minBirds === "" ? null : input.minBirds,
    minPer: input.minPer ?? "week",
    deliveryEvery: input.deliveryEvery,
    termsDays: input.termsDays,
    startDate: input.startDate,
    endDate: input.endDate,
    reviewOn: input.reviewOn === undefined || input.reviewOn === "" ? null : input.reviewOn,
    notes: typeof input.notes === "string" ? input.notes.trim() : (input.notes ?? ""),
    document: input.document ?? null,
  };
  const errors = validateContract(values);
  const [field] = Object.keys(errors) as (keyof ContractInput)[];
  if (field) throw new HttpError(400, "invalid_contract", errors[field]!, field);
  const v = values as ContractInput;
  return { ...v, document: v.document ? { url: v.document.url, name: String(v.document.name ?? "") } : null };
}

async function assertCustomer(farmId: string, id: string) {
  const customer = await CustomerModel.findOne({ _id: id, farmId }, { name: 1, status: 1 }).lean();
  if (!customer) throw new HttpError(400, "invalid_contract", "Choose a customer on the list.", "customerId");
  return customer;
}

/** A customer can't have two active contracts on the same days: then an order knows its price. */
async function assertNoOverlap(
  farmId: string,
  c: { customerId: string | Types.ObjectId; startDate: string; endDate: string },
  except?: Types.ObjectId,
) {
  const clash = await ContractModel.findOne({
    farmId,
    customerId: c.customerId,
    status: "active",
    startDate: { $lte: c.endDate },
    endDate: { $gte: c.startDate },
    ...(except ? { _id: { $ne: except } } : {}),
  }).lean();
  if (clash)
    throw new HttpError(
      409,
      "overlap",
      `${clash.number} already runs from ${formatRange({ from: clash.startDate, to: clash.endDate })}. End it first, or change these dates.`,
      "startDate",
    );
}

/**
 * Writes a contract: a draft to finish later, or active at once (`activate`). The number
 * (CON-2026-0001) is taken atomically. `saveAsTemplate` keeps its terms to start the next one from.
 */
export async function createContract(actor: CurrentUser, input: Record<string, unknown>, today = lagosToday()) {
  await connectDb();
  const values = clean(input);
  await assertCustomer(actor.farmId, values.customerId);
  const activate = input.activate === true;
  if (activate) await assertNoOverlap(actor.farmId, values);
  const year = values.startDate.slice(0, 4);
  const seq = await nextSequence(actor.farmId, `contract:${year}`);
  const doc = await ContractModel.create({
    ...values,
    number: `CON-${year}-${String(seq).padStart(4, "0")}`,
    status: activate ? "active" : "draft",
    farmId: actor.farmId,
    createdBy: actor.id,
  });
  if (typeof input.saveAsTemplate === "string" && input.saveAsTemplate.trim())
    await createTemplate(actor, {
      ...values,
      name: input.saveAsTemplate,
      months: monthsBetween(values.startDate, values.endDate),
    });
  return view(doc.toObject() as unknown as Doc, await customerNames(actor.farmId), today);
}

/** The whole months a contract runs (at least one): a template's length from a contract's dates. */
export function monthsBetween(start: string, end: string) {
  let months = 1;
  while (months < 60 && endAfter(start, months + 1) <= end) months++;
  return months;
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id) ? await ContractModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!doc) throw new HttpError(404, "not_found", "That contract isn't here any more.");
  return doc;
}

const stale = () => new HttpError(409, "stale", "Someone changed this contract while you were editing. Open it again.");

/** Changes a draft or a running contract (an ended one stays as it was), from a form no older than the last save. */
export async function updateContract(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  version: unknown,
  today = lagosToday(),
) {
  const doc = await load(actor, id);
  if (typeof version !== "number" || version !== doc.__v) throw stale();
  const status = contractStatus(doc as unknown as Doc, today);
  if (status === "terminated" || status === "expired")
    throw new HttpError(409, "ended", `${doc.number} has ended, so it stays as agreed. Write a new contract instead.`);
  const values = clean({ ...input, customerId: String(doc.customerId) });
  if (doc.status === "active") await assertNoOverlap(actor.farmId, values, doc._id);
  // A new end date may be close again: warn about it then.
  if (values.endDate !== doc.endDate) doc.endingWarnedAt = null;
  doc.set(values);
  try {
    await doc.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return view(doc.toObject() as unknown as Doc, await customerNames(actor.farmId), today);
}

/** A draft is agreed: from now its price sets the customer's orders on its days. */
export async function activateContract(actor: CurrentUser, id: string, today = lagosToday()) {
  const doc = await load(actor, id);
  if (doc.status !== "draft") throw new HttpError(409, "not_draft", `${doc.number} isn't a draft.`);
  if (doc.endDate < today)
    throw new HttpError(409, "past", `${doc.number} ended on ${doc.endDate}: change its dates first.`);
  await assertCustomer(actor.farmId, String(doc.customerId));
  await assertNoOverlap(actor.farmId, doc, doc._id);
  doc.status = "active";
  await doc.save();
  return view(doc.toObject() as unknown as Doc, await customerNames(actor.farmId), today);
}

/** Ends a running contract early, on a day from its start to today. */
export async function endContract(actor: CurrentUser, id: string, on: unknown, today = lagosToday()) {
  const doc = await load(actor, id);
  if (contractStatus(doc as unknown as Doc, today) !== "active")
    throw new HttpError(409, "not_active", `${doc.number} isn't running.`);
  const day = on === undefined || on === "" ? today : on;
  if (typeof day !== "string" || !isISODate(day) || day > today || day < doc.startDate)
    throw new HttpError(400, "invalid_contract", "Choose the day it ended, from its start to today.", "terminatedOn");
  doc.set({ status: "terminated", terminatedOn: day });
  await doc.save();
  return view(doc.toObject() as unknown as Doc, await customerNames(actor.farmId), today);
}

/** Removes a draft written by mistake. Agreed contracts are history: end them instead. */
export async function deleteContract(actor: CurrentUser, id: string) {
  const doc = await load(actor, id);
  if (doc.status !== "draft")
    throw new HttpError(409, "not_draft", `${doc.number} was agreed, so it stays on record. End it instead.`);
  await doc.softDelete();
}

export type TemplateView = Terms & { id: string; name: string; months: number };

type TemplateDoc = Terms & { _id: unknown; name: string; months: number };
const templateView = (t: TemplateDoc): TemplateView => ({
  id: String(t._id),
  name: t.name,
  pricing: t.pricing,
  priceKobo: t.priceKobo,
  minBirds: t.minBirds ?? null,
  minPer: t.minPer,
  deliveryEvery: t.deliveryEvery,
  termsDays: t.termsDays,
  months: t.months,
});

export async function listTemplates(farmId: string): Promise<TemplateView[]> {
  await connectDb();
  const docs = await ContractTemplateModel.find({ farmId }).collation({ locale: "en" }).sort({ name: 1 }).lean();
  return docs.map((d) => templateView(d as unknown as TemplateDoc));
}

/** Keeps a contract's terms under a name, to start the next one from. */
export async function createTemplate(actor: CurrentUser, input: Record<string, unknown>) {
  await connectDb();
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > LIMITS.name)
    throw new HttpError(400, "invalid_template", "Give the template a short name.", "name");
  const values = {
    pricing: input.pricing,
    priceKobo: input.priceKobo,
    minBirds: input.minBirds === undefined || input.minBirds === "" ? null : input.minBirds,
    minPer: input.minPer ?? "week",
    deliveryEvery: input.deliveryEvery,
    termsDays: input.termsDays,
  };
  const errors = validateTerms(values);
  const [field] = Object.keys(errors) as (keyof Terms)[];
  if (field) throw new HttpError(400, "invalid_template", errors[field]!, field);
  const months = input.months;
  if (typeof months !== "number" || !Number.isInteger(months) || months < 1 || months > 60)
    throw new HttpError(400, "invalid_template", "Choose how many months a contract runs.", "months");
  const doc = await ContractTemplateModel.create({
    ...(values as Terms),
    name,
    months,
    farmId: actor.farmId,
    createdBy: actor.id,
  });
  return templateView(doc.toObject() as unknown as TemplateDoc);
}

export async function deleteTemplate(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id)
    ? await ContractTemplateModel.findOne({ _id: id, farmId: actor.farmId })
    : null;
  if (!doc) throw new HttpError(404, "not_found", "That template isn't here any more.");
  await doc.softDelete();
}

/**
 * Daily: tells the owners and the sales team about each running contract that ends within 30
 * days, once per end date, so there's time to agree the next one.
 */
export async function sendEndingWarnings(origin: string, today = lagosToday()) {
  await connectDb();
  const soon = await ContractModel.find({
    status: "active",
    endingWarnedAt: null,
    endDate: { $gte: today, $lte: addDays(today, ENDING_WARNING_DAYS) },
  }).lean();
  let sent = 0;
  for (const c of soon) {
    const [customer, team] = await Promise.all([
      CustomerModel.findById(c.customerId, { name: 1 }).lean(),
      UserModel.find(
        { farmId: c.farmId, role: { $in: ["owner", "sales"] }, status: "active" },
        { email: 1, name: 1 },
      ).lean(),
    ]);
    const who = customer?.name ?? "a customer";
    const days = Math.round((Date.parse(c.endDate) - Date.parse(today)) / 86_400_000);
    for (const person of team)
      await sendEmail({
        to: person.email,
        subject: `${who}'s contract ends ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
        text: `Hi ${person.name},\n\n${c.number} with ${who} (${formatNaira(c.priceKobo)} ${c.pricing === "perKg" ? "a kg" : "a bird"}) ends on ${formatRange({ from: c.endDate, to: c.endDate })}. Agree the next one in time:\n\n${origin}/contracts?open=${String(c._id)}\n\nFowlex`,
      });
    await ContractModel.updateOne({ _id: c._id }, { $set: { endingWarnedAt: new Date() } });
    sent++;
  }
  return sent;
}
