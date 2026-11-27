import "server-only";

import { Types } from "mongoose";

import { type EmployeeInput, tidyName, validateEmployee } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { isISODate, today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { checkedBank, type SavedAccount } from "@/lib/paystack/accounts";
import { createRecipient } from "@/lib/paystack/banks";
import { normalisePhone } from "@/lib/suppliers/rules";
import { BatchModel } from "@/models/batch";
import { EmployeeModel } from "@/models/employee";
import { UserModel } from "@/models/user";

export type EmployeeView = Omit<EmployeeInput, "bank"> & {
  id: string;
  version: number;
  status: "active" | "left";
  leftOn: string | null;
  bank: { bankCode: string; bankName: string; accountNumber: string; accountName: string; payable: boolean } | null;
  /** They can sign in to Fowlex (a user with their email on the farm). */
  hasLogin: boolean;
};

type Doc = Omit<EmployeeInput, "bank" | "batchIds"> & {
  _id: unknown;
  __v?: number;
  batchIds?: unknown[];
  status: "active" | "left";
  leftOn?: string | null;
  bank?: SavedAccount | null;
};
const view = (e: Doc, logins: Set<string>): EmployeeView => ({
  id: String(e._id),
  version: e.__v ?? 0,
  name: e.name,
  job: e.job ?? "",
  phone: e.phone ?? "",
  email: e.email ?? "",
  address: e.address ?? "",
  nextOfKinName: e.nextOfKinName ?? "",
  nextOfKinPhone: e.nextOfKinPhone ?? "",
  startDate: e.startDate,
  payType: e.payType,
  rateKobo: e.rateKobo,
  batchIds: (e.batchIds ?? []).map(String),
  notes: e.notes ?? "",
  status: e.status,
  leftOn: e.leftOn ?? null,
  bank: e.bank
    ? {
        bankCode: e.bank.bankCode,
        bankName: e.bank.bankName,
        accountNumber: e.bank.accountNumber,
        accountName: e.bank.accountName,
        payable: !!e.bank.recipientCode,
      }
    : null,
  hasLogin: !!e.email && logins.has(e.email),
});

const loginsOf = async (farmId: string) =>
  new Set((await UserModel.find({ farmId, status: "active" }, { email: 1 }).lean()).map((u) => u.email));

/** The farm's people: those working here first, A to Z. */
export async function listEmployees(farmId: string): Promise<EmployeeView[]> {
  await connectDb();
  const [docs, logins] = await Promise.all([
    EmployeeModel.find({ farmId }).collation({ locale: "en" }).sort({ status: 1, name: 1 }).lean(),
    loginsOf(farmId),
  ]);
  return docs.map((d) => view(d as unknown as Doc, logins));
}

function clean(input: Record<string, unknown>, today: string) {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : (v ?? ""));
  const values = {
    name: typeof input.name === "string" ? tidyName(input.name) : input.name,
    job: text(input.job),
    phone: text(input.phone),
    email: typeof input.email === "string" ? input.email.trim().toLowerCase() : (input.email ?? ""),
    address: text(input.address),
    nextOfKinName: text(input.nextOfKinName),
    nextOfKinPhone: text(input.nextOfKinPhone),
    startDate: input.startDate === undefined || input.startDate === "" ? today : input.startDate,
    payType: input.payType,
    rateKobo: input.rateKobo,
    batchIds: input.batchIds ?? [],
    notes: text(input.notes),
    bank: input.bank ?? null,
  };
  const errors = validateEmployee(values, { today });
  const [field] = Object.keys(errors) as (keyof EmployeeInput)[];
  if (field) throw new HttpError(400, "invalid_employee", errors[field]!, field);
  const v = values as EmployeeInput;
  return {
    ...v,
    phone: v.phone ? normalisePhone(v.phone)! : "",
    nextOfKinPhone: v.nextOfKinPhone ? normalisePhone(v.nextOfKinPhone)! : "",
    // Only per-batch workers look after batches.
    batchIds: v.payType === "per-batch" ? [...new Set(v.batchIds)] : [],
  };
}

async function assertBatches(farmId: string, ids: string[]) {
  if (!ids.length) return;
  const found = await BatchModel.countDocuments({ farmId, _id: { $in: ids } });
  if (found !== ids.length) throw new HttpError(400, "invalid_employee", "Choose batches on the farm.", "batchIds");
}

/** Adds someone who works on the farm; their bank account is checked with the bank first. */
export async function createEmployee(actor: CurrentUser, input: Record<string, unknown>, today = lagosToday()) {
  const values = clean(input, today);
  await connectDb();
  await assertBatches(actor.farmId, values.batchIds);
  const bank = await checkedBank(values.bank);
  const doc = await EmployeeModel.create({ ...values, bank, farmId: actor.farmId, createdBy: actor.id });
  return view(doc.toObject() as unknown as Doc, await loginsOf(actor.farmId));
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id) ? await EmployeeModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!doc) throw new HttpError(404, "not_found", "That person isn't on the farm's list any more.");
  return doc;
}

const stale = () => new HttpError(409, "stale", "Someone changed this person while you were editing. Open it again.");

/** Saves someone's details from a form no older than the last save. */
export async function updateEmployee(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  version: unknown,
  today = lagosToday(),
) {
  const values = clean(input, today);
  const doc = await load(actor, id);
  if (typeof version !== "number" || version !== doc.__v) throw stale();
  await assertBatches(actor.farmId, values.batchIds);
  const bank = await checkedBank(values.bank, doc.bank as SavedAccount | null);
  doc.set({ ...values, bank });
  try {
    await doc.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return view(doc.toObject() as unknown as Doc, await loginsOf(actor.farmId));
}

/** Someone leaves (kept for history, out of new payroll runs), or comes back. */
export async function setEmployeeStatus(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  today = lagosToday(),
) {
  const doc = await load(actor, id);
  if (input.status === "active") doc.set({ status: "active", leftOn: null });
  else if (input.status === "left") {
    const on = input.leftOn === undefined || input.leftOn === "" ? today : input.leftOn;
    if (typeof on !== "string" || !isISODate(on) || on > today || on < doc.startDate)
      throw new HttpError(400, "invalid_employee", "Choose their last day, from when they started to today.", "leftOn");
    doc.set({ status: "left", leftOn: on });
  } else throw new HttpError(400, "invalid_employee", "Choose working here or left.", "status");
  await doc.save();
  return view(doc.toObject() as unknown as Doc, await loginsOf(actor.farmId));
}

/** Removes someone added by mistake (kept, hidden and audited). Someone who was paid is marked as left instead. */
export async function deleteEmployee(actor: CurrentUser, id: string) {
  const doc = await load(actor, id);
  await doc.softDelete();
}

/** The Paystack recipient to pay someone, made now if Paystack couldn't when the account was saved. */
export async function employeeRecipient(farmId: string, id: string) {
  const doc = await EmployeeModel.findOne({ _id: id, farmId });
  if (!doc) throw new HttpError(404, "not_found", "That person isn't on the farm's list any more.");
  if (!doc.bank) throw new HttpError(409, "no_bank", `Add ${doc.name}'s bank account to pay them through Paystack.`);
  if (!doc.bank.recipientCode) {
    doc.bank.recipientCode = await createRecipient(doc.bank);
    await doc.save();
  }
  const b = doc.bank;
  return {
    bankCode: b.bankCode,
    bankName: b.bankName,
    accountNumber: b.accountNumber,
    accountName: b.accountName,
    recipientCode: b.recipientCode,
  };
}
