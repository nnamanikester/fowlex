import "server-only";

import { Types } from "mongoose";

import { type BankAccount, nameKey, normalisePhone, type SupplierInput, tidyName, validateSupplier } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { connectDb } from "@/lib/db";
import { createRecipient, resolveAccount } from "@/lib/paystack/banks";
import { SupplierModel } from "@/models/supplier";

export type SupplierView = Omit<SupplierInput, "bank"> & {
  id: string;
  version: number;
  archived: boolean;
  bank: (BankAccount & { payable: boolean }) | null;
};

type Doc = Omit<SupplierInput, "bank"> & {
  _id: unknown;
  __v?: number;
  archived?: boolean;
  bank?: (BankAccount & { recipientCode?: string | null }) | null;
};
const view = (s: Doc): SupplierView => ({
  id: String(s._id),
  version: s.__v ?? 0,
  name: s.name,
  supplies: s.supplies ?? [],
  contactName: s.contactName ?? "",
  phone: s.phone ?? "",
  email: s.email ?? "",
  address: s.address ?? "",
  notes: s.notes ?? "",
  archived: s.archived ?? false,
  bank: s.bank
    ? {
        bankCode: s.bank.bankCode,
        bankName: s.bank.bankName,
        accountNumber: s.bank.accountNumber,
        accountName: s.bank.accountName,
        payable: !!s.bank.recipientCode,
      }
    : null,
});

/** The farm's suppliers, A to Z. */
export async function listSuppliers(farmId: string): Promise<SupplierView[]> {
  await connectDb();
  const docs = await SupplierModel.find({ farmId }).collation({ locale: "en" }).sort({ name: 1 }).lean();
  return docs.map((d) => view(d as unknown as Doc));
}

export async function getSupplier(farmId: string, id: string): Promise<SupplierView | null> {
  await connectDb();
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = await SupplierModel.findOne({ _id: id, farmId }).lean();
  return doc ? view(doc as unknown as Doc) : null;
}

function clean(input: Record<string, unknown>) {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : (v ?? ""));
  const values = {
    name: typeof input.name === "string" ? tidyName(input.name) : input.name,
    supplies: input.supplies ?? [],
    contactName: text(input.contactName),
    phone: text(input.phone),
    email: typeof input.email === "string" ? input.email.trim().toLowerCase() : (input.email ?? ""),
    address: text(input.address),
    notes: text(input.notes),
    bank: input.bank ?? null,
  };
  const errors = validateSupplier(values);
  const [field] = Object.keys(errors) as (keyof SupplierInput)[];
  if (field) throw new HttpError(400, "invalid_supplier", errors[field]!, field);
  const v = values as SupplierInput;
  return { ...v, phone: v.phone ? normalisePhone(v.phone)! : "", supplies: [...new Set(v.supplies)] };
}

/**
 * The bank account to keep: checked with the bank (the name is the bank's, whatever the form
 * said), with a Paystack recipient to pay it. An unchanged account is kept as it was. If Paystack
 * can't make the recipient right now, the account is kept and the recipient made when first paid.
 */
async function checkedBank(bank: BankAccount | null, before?: Doc["bank"]) {
  if (!bank) return null;
  if (before && before.bankCode === bank.bankCode && before.accountNumber === bank.accountNumber) return before;
  const account = await resolveAccount(bank.accountNumber, bank.bankCode).catch((error: HttpError) => {
    throw error.status === 503
      ? new HttpError(
          503,
          error.code,
          "We couldn't check the bank account just now. Try saving again in a moment.",
          "bank",
        )
      : new HttpError(400, error.code, error.message, "bank");
  });
  const recipientCode = await createRecipient(account).catch((error: HttpError) => {
    if (error.status === 503) return null;
    throw new HttpError(400, error.code, error.message, "bank");
  });
  return { ...account, recipientCode, verifiedAt: new Date() };
}

const duplicate = (name: string) =>
  new HttpError(409, "duplicate_name", `There's already a supplier called ${name}.`, "name");
const stale = () => new HttpError(409, "stale", "Someone changed this supplier while you were editing. Open it again.");

export async function createSupplier(actor: CurrentUser, input: Record<string, unknown>): Promise<SupplierView> {
  const values = clean(input);
  await connectDb();
  if (await SupplierModel.exists({ farmId: actor.farmId, nameKey: nameKey(values.name) })) throw duplicate(values.name);
  const bank = await checkedBank(values.bank);
  try {
    const doc = await SupplierModel.create({
      ...values,
      bank,
      nameKey: nameKey(values.name),
      farmId: actor.farmId,
      createdBy: actor.id,
    });
    return view(doc.toObject() as unknown as Doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw duplicate(values.name);
    throw error;
  }
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id) ? await SupplierModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!doc) throw new HttpError(404, "not_found", "That supplier doesn't exist any more.");
  return doc;
}

/** Saves a supplier from a form no older than the last save; `archived` hides it from new purchases. */
export async function updateSupplier(actor: CurrentUser, id: string, input: Record<string, unknown>, version: unknown) {
  const values = clean(input);
  const doc = await load(actor, id);
  if (typeof version !== "number" || version !== doc.__v) throw stale();
  const before = doc.toObject() as unknown as Doc;
  const bank = await checkedBank(values.bank, before.bank);
  doc.set({
    ...values,
    bank,
    nameKey: nameKey(values.name),
    ...(typeof input.archived === "boolean" && { archived: input.archived }),
  });
  try {
    await doc.save();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw duplicate(values.name);
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return view(doc.toObject() as unknown as Doc);
}

/** Removes a supplier (kept, hidden and audited). */
export async function deleteSupplier(actor: CurrentUser, id: string) {
  const doc = await load(actor, id);
  await doc.softDelete();
}

/**
 * The Paystack recipient to pay a supplier, made now if Paystack couldn't make it when the account
 * was saved. Refused when the supplier has no bank account.
 */
export async function payableRecipient(farmId: string, id: string) {
  const doc = await SupplierModel.findOne({ _id: id, farmId });
  if (!doc) throw new HttpError(404, "not_found", "That supplier doesn't exist any more.");
  const bank = doc.bank;
  if (!bank)
    throw new HttpError(
      409,
      "no_bank",
      `Add ${doc.name}'s bank account before paying them through Paystack.`,
      "supplierId",
    );
  if (!bank.recipientCode) {
    bank.recipientCode = await createRecipient(bank);
    await doc.save();
  }
  return {
    recipientCode: bank.recipientCode,
    name: doc.name,
    bank: { ...view(doc.toObject() as unknown as Doc).bank! },
  };
}
