import "server-only";

import { Types } from "mongoose";

import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { startTransferCharge, verifyCharge } from "@/lib/paystack/collect";
import { recordPayment } from "@/lib/payments/service";
import { CollectionModel } from "@/models/collection";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";

/** How long a transfer account works: long enough to open a bank app and send, short enough to be one sale. */
export const ACCOUNT_MINUTES = 60;

/**
 * The email Paystack needs for a payment. The customer's own, or, for someone who gave none, one
 * made from the invoice number (customer+inv-2026-0001@fowlex.com), so the payment is still tied
 * to its invoice at Paystack.
 */
export function payerEmail(customerEmail: string | null | undefined, invoiceNumber: string) {
  if (customerEmail) return customerEmail;
  const domain = process.env.PAYSTACK_PLACEHOLDER_DOMAIN || "fowlex.com";
  return `customer+${invoiceNumber.toLowerCase().replace(/[^a-z0-9-]/g, "")}@${domain}`;
}

export type CollectionView = {
  id: string;
  /** Paystack's reference for the payment, to find it there. */
  reference: string;
  invoiceId: string;
  invoiceNumber: string;
  amountKobo: number;
  accountNumber: string;
  accountName: string;
  bankName: string;
  expiresAt: string;
  status: "waiting" | "paid" | "expired";
  paidAt: string | null;
};

type Doc = {
  _id: unknown;
  reference: string;
  invoiceId: unknown;
  amountKobo: number;
  accountNumber: string;
  accountName: string;
  bankName: string;
  expiresAt: Date;
  status: CollectionView["status"];
  paidAt: Date | null;
};

const view = (c: Doc, invoiceNumber: string): CollectionView => ({
  id: String(c._id),
  reference: c.reference,
  invoiceId: String(c.invoiceId),
  invoiceNumber,
  amountKobo: c.amountKobo,
  accountNumber: c.accountNumber,
  accountName: c.accountName,
  bankName: c.bankName,
  expiresAt: c.expiresAt.toISOString(),
  status: c.status,
  paidAt: c.paidAt ? c.paidAt.toISOString() : null,
});

/**
 * A bank account to pay what's left on an invoice by transfer. One still waiting for the same
 * amount is shown again rather than made anew, so the customer never has two accounts for one
 * bill. `by` is who asked (someone at the farm, or the customer in the portal).
 */
export async function collectByTransfer(farmId: string, invoiceId: string, by: string, now = new Date()) {
  await connectDb();
  const invoice = Types.ObjectId.isValid(invoiceId)
    ? await InvoiceModel.findOne({ _id: invoiceId, farmId }).lean()
    : null;
  if (!invoice) throw new HttpError(404, "not_found", "That invoice isn't here any more.");
  if (invoice.state === "void")
    throw new HttpError(409, "void", `${invoice.number} is void, so nothing is owed on it.`);
  const amount = invoice.totalKobo - invoice.paidKobo;
  if (amount <= 0) throw new HttpError(409, "paid", `${invoice.number} is paid in full.`);

  const open = await CollectionModel.findOne({
    farmId,
    invoiceId: invoice._id,
    status: "waiting",
    amountKobo: amount,
    expiresAt: { $gt: new Date(now.getTime() + 5 * 60_000) },
  }).lean();
  if (open) return view(open as unknown as Doc, invoice.number);

  const customer = await CustomerModel.findById(invoice.customerId, { email: 1 }).lean();
  const tries = await CollectionModel.countDocuments({ invoiceId: invoice._id }).setOptions({ withDeleted: true });
  const reference = `fwx-pay-${invoice.number.toLowerCase()}-${tries + 1}`;
  const email = payerEmail(customer?.email, invoice.number);
  const account = await startTransferCharge({
    email,
    amountKobo: amount,
    reference,
    expiresAt: new Date(now.getTime() + ACCOUNT_MINUTES * 60_000),
    metadata: { invoiceId: String(invoice._id), invoiceNumber: invoice.number, farmId },
  });
  const doc = await CollectionModel.create({
    farmId,
    createdBy: Types.ObjectId.isValid(by) ? by : null,
    invoiceId: invoice._id,
    reference: account.reference,
    amountKobo: amount,
    email,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    bankName: account.bankName,
    expiresAt: account.expiresAt,
  });
  return view(doc.toObject() as unknown as Doc, invoice.number);
}

/**
 * Has the money come in? Asks Paystack (never trusting what a webhook body says), and when it has,
 * records the payment on the invoice once. An account past its time with nothing in is marked expired.
 */
export async function checkCollection(farmId: string, id: string, now = new Date()) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id) ? await CollectionModel.findOne({ _id: id, farmId }).lean() : null;
  if (!doc) throw new HttpError(404, "not_found", "That payment account isn't here any more.");
  if (doc.status === "waiting") await settleByReference(doc.reference, now);
  const fresh = (await CollectionModel.findById(doc._id).lean())!;
  const invoice = await InvoiceModel.findById(fresh.invoiceId, { number: 1 }).setOptions({ withDeleted: true }).lean();
  return view(fresh as unknown as Doc, invoice?.number ?? "");
}

/** Settles a transfer account from Paystack's word on it: for the webhook (charge.success) and checks. */
export async function settleByReference(reference: string, now = new Date()) {
  await connectDb();
  const doc = await CollectionModel.findOne({ reference }).lean();
  if (!doc || doc.status !== "waiting") return false;
  const found = await verifyCharge(reference);
  if (found?.status !== "success") {
    if (doc.expiresAt < now)
      await CollectionModel.updateOne({ _id: doc._id, status: "waiting" }, { $set: { status: "expired" } });
    return false;
  }
  // Claimed first, so the webhook and a check arriving together record it once.
  const claimed = await CollectionModel.findOneAndUpdate(
    { _id: doc._id, status: "waiting" },
    { $set: { status: "paid", paidAt: found.paidAt ?? now } },
    { returnDocument: "after" },
  );
  if (!claimed) return false;
  const invoice = await InvoiceModel.findById(doc.invoiceId).lean();
  // Voided meanwhile: the money is in (to refund from Paystack), but nothing is owed on it.
  if (!invoice || invoice.state === "void") return true;
  const left = invoice.totalKobo - invoice.paidKobo;
  const amount = Math.min(found.amountKobo || doc.amountKobo, left);
  // Paid some other way meanwhile: the money is in, but the invoice owes nothing more.
  if (amount <= 0) return true;
  const actor: CurrentUser = {
    id: String(doc.createdBy ?? invoice.createdBy ?? new Types.ObjectId()),
    farmId: String(doc.farmId),
    name: "Paystack",
    email: "",
    role: "owner",
  };
  const payment = await recordPayment(
    actor,
    String(invoice._id),
    { amountKobo: amount, method: "paystack", reference, notes: "Paid by transfer to its own account" },
    lagosToday(found.paidAt ?? now),
  );
  await CollectionModel.updateOne({ _id: doc._id }, { $set: { paymentId: payment.id } });
  return true;
}

/** The transfer accounts made for an invoice, newest first. */
export async function listCollections(farmId: string, invoiceId: string) {
  await connectDb();
  if (!Types.ObjectId.isValid(invoiceId)) return [];
  const invoice = await InvoiceModel.findOne({ _id: invoiceId, farmId }, { number: 1 }).lean();
  if (!invoice) return [];
  const docs = await CollectionModel.find({ farmId, invoiceId }).sort({ _id: -1 }).lean();
  return docs.map((d) => view(d as unknown as Doc, invoice.number));
}
