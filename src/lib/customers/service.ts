import "server-only";

import { Types } from "mongoose";

import { type CustomerInput, type CustomerType, tidyName, validateCustomer } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { connectDb } from "@/lib/db";
import { readSettings } from "@/lib/settings/service";
import { normalisePhone } from "@/lib/suppliers/rules";
import { CustomerModel } from "@/models/customer";
import { InviteModel } from "@/models/invite";
import { UserModel } from "@/models/user";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email";
import { INVITE_DAYS } from "@/lib/users/service";

export type CustomerView = CustomerInput & {
  id: string;
  version: number;
  status: "active" | "archived";
  /** They can sign in to the customer portal. */
  hasLogin: boolean;
  /** An invite to the portal is waiting to be accepted. */
  invited: boolean;
  /** The farm's account for buyers who give no details. */
  walkIn: boolean;
};

/** As stored: every field has a default, so nothing is missing. */
type Doc = CustomerInput & {
  _id: unknown;
  __v: number;
  walkIn?: boolean;
  status: "active" | "archived";
  userId?: unknown;
};
const view = (c: Doc, invited = new Set<string>()): CustomerView => ({
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
  invited: !c.userId && invited.has(String(c._id)),
  walkIn: !!c.walkIn,
});

/** Customers with a portal invite still waiting. */
async function waiting(farmId: string) {
  const invites = await InviteModel.find(
    { farmId, role: "customer", acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } },
    { customerId: 1 },
  ).lean();
  return new Set(invites.map((i) => String(i.customerId)));
}

export const WALK_IN_NAME = "Walk-in customers";

/**
 * The farm's account for buyers who give no name, phone or email: one-off buyers of a bird or
 * two. Made the first time it's needed, so a sale or an invoice never waits for a customer.
 */
export async function walkInCustomer(farmId: string) {
  await connectDb();
  const found = await CustomerModel.findOne({ farmId, walkIn: true }).lean();
  if (found) return found;
  try {
    return (
      await CustomerModel.create({
        farmId,
        createdBy: null,
        walkIn: true,
        name: WALK_IN_NAME,
        type: "individual",
        termsDays: 0,
        notes: "Everyone who buys without giving their details.",
      })
    ).toObject();
  } catch (error) {
    // Made by another request a moment ago.
    if ((error as { code?: number }).code === 11000)
      return (await CustomerModel.findOne({ farmId, walkIn: true }).lean())!;
    throw error;
  }
}

/** The farm's customers: walk-ins first, then active ones, A to Z. */
export async function listCustomers(farmId: string): Promise<CustomerView[]> {
  await connectDb();
  await walkInCustomer(farmId);
  const [docs, invited] = await Promise.all([
    CustomerModel.find({ farmId }).collation({ locale: "en" }).sort({ status: 1, name: 1 }).lean(),
    waiting(farmId),
  ]);
  const views = docs.map((d) => view(d as unknown as Doc, invited));
  return [...views.filter((c) => c.walkIn), ...views.filter((c) => !c.walkIn)];
}

export async function getCustomer(farmId: string, id: string): Promise<CustomerView | null> {
  await connectDb();
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = await CustomerModel.findOne({ _id: id, farmId }).lean();
  return doc ? view(doc as unknown as Doc, await waiting(farmId)) : null;
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

const walkInStays = () => new HttpError(409, "walk_in", "Walk-in customers holds every sale without a name: it stays.");

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
  if (doc.walkIn) throw walkInStays();
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
  if (doc.walkIn) throw walkInStays();
  await doc.softDelete();
}

/**
 * Invites a customer to the portal: a link to their email to set a password, after which they
 * see their own invoices, orders, contracts and statement there. A newer invite replaces an older
 * one; someone who already has a Fowlex account can't be invited again.
 */
export async function inviteCustomer(actor: CurrentUser, id: string, origin: string) {
  const doc = await load(actor, id);
  if (doc.walkIn)
    throw new HttpError(
      409,
      "walk_in",
      "Walk-in customers is for buyers who give no details: there's no one to invite.",
    );
  if (doc.status !== "active") throw new HttpError(409, "archived", `${doc.name} is archived: bring them back first.`);
  if (doc.userId) throw new HttpError(409, "has_login", `${doc.name} already uses the portal.`);
  if (!doc.email)
    throw new HttpError(409, "no_email", `Add ${doc.name}'s email first: the invite goes there.`, "email");
  if (await UserModel.exists({ email: doc.email }))
    throw new HttpError(409, "already_member", `${doc.email} already has a Fowlex account.`);
  const now = new Date();
  await InviteModel.updateMany(
    { farmId: actor.farmId, email: doc.email, acceptedAt: null, revokedAt: null },
    { revokedAt: now },
  );
  const token = newToken();
  await InviteModel.create({
    farmId: actor.farmId,
    createdBy: actor.id,
    email: doc.email,
    role: "customer",
    customerId: doc._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60_000),
  });
  const settings = await readSettings(actor.farmId);
  await sendEmail({
    to: doc.email,
    subject: `Your account with ${settings.businessName}`,
    text: [
      `Hello ${doc.contactName || doc.name},`,
      "",
      `${settings.businessName} invited ${doc.name} to its customer portal: see your invoices and pay them, your orders, contracts and statement, any time.`,
      "",
      "Open this link to set your password:",
      "",
      `${origin}/auth/invite?token=${token}`,
      "",
      `The link works once and expires in ${INVITE_DAYS} days.`,
    ].join("\n"),
  });
  return view(doc.toObject() as unknown as Doc, new Set([String(doc._id)]));
}
