import "server-only";

import { Types } from "mongoose";

import { type CustomerInput, type CustomerType, tidyName, validateCustomer } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { connectDb } from "@/lib/db";
import { readSettings } from "@/lib/settings/service";
import { normalisePhone } from "@/lib/suppliers/rules";
import { CustomerModel } from "@/models/customer";

export type CustomerView = CustomerInput & {
  id: string;
  version: number;
  status: "active" | "archived";
  /** They can sign in to the customer portal. */
  hasLogin: boolean;
};

/** As stored: every field has a default, so nothing is missing. */
type Doc = CustomerInput & {
  _id: unknown;
  __v: number;
  status: "active" | "archived";
  userId?: unknown;
};
const view = (c: Doc): CustomerView => ({
  id: String(c._id),
  version: c.__v,
  name: c.name,
  type: c.type as CustomerType,
  contactName: c.contactName,
  phone: c.phone,
  email: c.email,
  address: c.address,
  creditLimitKobo: c.creditLimitKobo ?? null,
  termsDays: c.termsDays,
  notes: c.notes,
  status: c.status,
  hasLogin: !!c.userId,
});

/** The farm's customers: active first, A to Z. */
export async function listCustomers(farmId: string): Promise<CustomerView[]> {
  await connectDb();
  const docs = await CustomerModel.find({ farmId }).collation({ locale: "en" }).sort({ status: 1, name: 1 }).lean();
  return docs.map((d) => view(d as unknown as Doc));
}

export async function getCustomer(farmId: string, id: string): Promise<CustomerView | null> {
  await connectDb();
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = await CustomerModel.findOne({ _id: id, farmId }).lean();
  return doc ? view(doc as unknown as Doc) : null;
}

async function clean(farmId: string, input: Record<string, unknown>) {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : (v ?? ""));
  const values = {
    name: typeof input.name === "string" ? tidyName(input.name) : input.name,
    type: input.type,
    contactName: text(input.contactName),
    phone: text(input.phone),
    email: typeof input.email === "string" ? input.email.trim().toLowerCase() : (input.email ?? ""),
    address: text(input.address),
    // Left out, a customer gets the farm's usual terms.
    termsDays:
      input.termsDays === undefined || input.termsDays === null
        ? (await readSettings(farmId)).paymentTermsDays
        : input.termsDays,
    creditLimitKobo: input.creditLimitKobo === undefined ? null : input.creditLimitKobo,
    notes: text(input.notes),
  };
  const errors = validateCustomer(values);
  const [field] = Object.keys(errors) as (keyof CustomerInput)[];
  if (field) throw new HttpError(400, "invalid_customer", errors[field]!, field);
  const v = values as CustomerInput;
  return { ...v, phone: v.phone ? normalisePhone(v.phone)! : "" };
}

/** No two active customers with the same name: the second is almost always a typo or a repeat. */
async function assertUnique(farmId: string, name: string, except?: unknown) {
  const twin = await CustomerModel.findOne({ farmId, status: "active", ...(except ? { _id: { $ne: except } } : {}) })
    .where("name")
    .equals(name)
    .collation({ locale: "en", strength: 2 })
    .lean();
  if (twin) throw new HttpError(409, "duplicate", `${twin.name} is already a customer.`, "name");
}

export async function createCustomer(actor: CurrentUser, input: Record<string, unknown>) {
  await connectDb();
  const values = await clean(actor.farmId, input);
  await assertUnique(actor.farmId, values.name);
  const doc = await CustomerModel.create({ ...values, farmId: actor.farmId, createdBy: actor.id });
  return view(doc.toObject() as unknown as Doc);
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id) ? await CustomerModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!doc) throw new HttpError(404, "not_found", "That customer isn't on the list any more.");
  return doc;
}

const stale = () => new HttpError(409, "stale", "Someone changed this customer while you were editing. Open it again.");

/** Saves a customer's details from a form no older than the last save. */
export async function updateCustomer(actor: CurrentUser, id: string, input: Record<string, unknown>, version: unknown) {
  const doc = await load(actor, id);
  if (typeof version !== "number" || version !== doc.__v) throw stale();
  const values = await clean(actor.farmId, input);
  if (doc.status === "active") await assertUnique(actor.farmId, values.name, doc._id);
  doc.set(values);
  try {
    await doc.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return view(doc.toObject() as unknown as Doc);
}

/** Archived customers leave the lists for new orders but keep their history; they can come back. */
export async function setCustomerStatus(actor: CurrentUser, id: string, status: unknown) {
  const doc = await load(actor, id);
  if (status !== "active" && status !== "archived")
    throw new HttpError(400, "invalid_customer", "Choose active or archived.", "status");
  if (status === "active") await assertUnique(actor.farmId, doc.name, doc._id);
  doc.status = status;
  await doc.save();
  return view(doc.toObject() as unknown as Doc);
}

/** Removes a customer added by mistake (kept, hidden and audited). */
export async function deleteCustomer(actor: CurrentUser, id: string) {
  const doc = await load(actor, id);
  await doc.softDelete();
}
