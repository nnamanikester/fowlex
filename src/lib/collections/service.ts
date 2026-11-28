import "server-only";

import { randomBytes } from "node:crypto";

import { Types } from "mongoose";

import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { startCheckout, startTransferCharge, verifyCharge } from "@/lib/paystack/collect";
import { recordPayment } from "@/lib/payments/service";
import { CollectionModel } from "@/models/collection";
import { CustomerModel } from "@/models/customer";
import { nextSequence } from "@/models/counter";
import { ExpenseModel } from "@/models/expense";
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

/**
 * A reference for a payment at Paystack: the invoice number to find it by, and a random part.
 * Paystack's references are unique across the whole account, and every farm has an INV-2026-0001.
 */
const referenceFor = (kind: "pay" | "chk", number: string) =>
  `fwx-${kind}-${number.toLowerCase().replace(/[^a-z0-9-]/g, "")}-${randomBytes(4).toString("hex")}`;

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
  /** When a transfer account stops working ("" for a checkout). */
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
  expiresAt: Date | null;
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
  expiresAt: c.expiresAt ? c.expiresAt.toISOString() : "",
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
    kind: { $ne: "checkout" },
    status: "waiting",
    amountKobo: amount,
    expiresAt: { $gt: new Date(now.getTime() + 5 * 60_000) },
  }).lean();
  if (open) return view(open as unknown as Doc, invoice.number);

  const customer = await CustomerModel.findById(invoice.customerId, { email: 1 }).lean();
  const reference = referenceFor("pay", invoice.number);
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
    if (doc.expiresAt && doc.expiresAt < now)
      await CollectionModel.updateOne({ _id: doc._id, status: "waiting" }, { $set: { status: "expired" } });
    return false;
  }
  // Claimed first, so the webhook and a check arriving together record it once.
  const claimed = await CollectionModel.findOneAndUpdate(
    { _id: doc._id, status: "waiting" },
    { $set: { status: "paid", paidAt: found.paidAt ?? now, feeKobo: found.feeKobo } },
    { returnDocument: "after" },
  );
  if (!claimed) return false;
  await bookFee(doc, found.feeKobo, lagosToday(found.paidAt ?? now));
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
    {
      amountKobo: amount,
      method: "paystack",
      reference,
      notes: doc.kind === "checkout" ? "Paid online with Paystack" : "Paid by transfer to its own account",
    },
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

/**
 * What Paystack kept for taking a payment, as a bank charge: the farm sees what each payment
 * really brought in. Once per payment (a repeat finds it there).
 */
async function bookFee(
  c: {
    _id: Types.ObjectId;
    farmId: Types.ObjectId;
    createdBy?: Types.ObjectId | null;
    invoiceId: Types.ObjectId;
    amountKobo: number;
  },
  feeKobo: number,
  day: string,
) {
  if (!(feeKobo > 0)) return;
  const invoice = await InvoiceModel.findById(c.invoiceId, { number: 1 }).setOptions({ withDeleted: true }).lean();
  const farmId = String(c.farmId);
  const year = day.slice(0, 4);
  try {
    await ExpenseModel.create({
      farmId,
      createdBy: c.createdBy ?? null,
      number: `EXP-${year}-${String(await nextSequence(farmId, `expense:${year}`)).padStart(4, "0")}`,
      date: day,
      category: "bank-charges",
      description: `Paystack fee for taking ${invoice?.number ?? "a payment"} (${formatNaira(c.amountKobo)})`,
      payeeName: "Paystack",
      amountKobo: feeKobo,
      method: "paystack",
      paymentStatus: "paid",
      paidOn: day,
      source: { kind: "collection-fee", id: c._id },
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

/** The invoice's pay link key: made once, the same every time it's shared. */
export async function payLinkToken(farmId: string, invoiceId: string) {
  await connectDb();
  const invoice = Types.ObjectId.isValid(invoiceId)
    ? await InvoiceModel.findOne({ _id: invoiceId, farmId }, { payToken: 1, state: 1, number: 1 }).lean()
    : null;
  if (!invoice) throw new HttpError(404, "not_found", "That invoice isn't here any more.");
  if (invoice.state === "void")
    throw new HttpError(409, "void", `${invoice.number} is void, so nothing is owed on it.`);
  if (invoice.payToken) return invoice.payToken;
  const token = randomBytes(18).toString("base64url");
  // Set once: two at the same time end up with the same link.
  await InvoiceModel.updateOne({ _id: invoice._id, payToken: null }, { $set: { payToken: token } });
  return (await InvoiceModel.findById(invoice._id, { payToken: 1 }).lean())!.payToken!;
}

export type PayPage = {
  token: string;
  farm: { name: string; phone: string; email: string };
  customerName: string;
  number: string;
  issueDate: string;
  dueDate: string;
  lines: { description: string; amountKobo: number }[];
  totalKobo: number;
  paidKobo: number;
  balanceKobo: number;
  state: string;
  /** A transfer account still waiting, to show again. */
  account: CollectionView | null;
  /** The last payment that came in, for the receipt. */
  lastPaid: { amountKobo: number; at: string } | null;
};

async function byToken(token: string) {
  await connectDb();
  if (typeof token !== "string" || !/^[\w-]{16,40}$/.test(token)) return null;
  return InvoiceModel.findOne({ payToken: token }).lean();
}

/** What the public pay page shows: the bill, what's left, and how it can be paid. Null for an unknown link. */
export async function payPage(token: string, now = new Date()): Promise<PayPage | null> {
  const invoice = await byToken(token);
  if (!invoice) return null;
  const { readSettings } = await import("@/lib/settings/service");
  const [settings, customer, open, paid] = await Promise.all([
    readSettings(String(invoice.farmId)),
    CustomerModel.findById(invoice.customerId, { name: 1 }).setOptions({ withDeleted: true }).lean(),
    CollectionModel.findOne({
      invoiceId: invoice._id,
      kind: { $ne: "checkout" },
      status: "waiting",
      expiresAt: { $gt: now },
    }).lean(),
    CollectionModel.findOne({ invoiceId: invoice._id, status: "paid" }).sort({ paidAt: -1 }).lean(),
  ]);
  return {
    token,
    farm: { name: settings.businessName, phone: settings.phone, email: settings.email },
    customerName: customer?.name ?? "",
    number: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    lines: invoice.lines.map((l) => ({ description: l.description, amountKobo: l.amountKobo })),
    totalKobo: invoice.totalKobo,
    paidKobo: invoice.paidKobo,
    balanceKobo: Math.max(0, invoice.totalKobo - invoice.paidKobo),
    state: invoice.state,
    account: open ? view(open as unknown as Doc, invoice.number) : null,
    lastPaid: paid?.paidAt ? { amountKobo: paid.amountKobo, at: paid.paidAt.toISOString() } : null,
  };
}

/** A pay link's invoice, for paying it: refused when there's nothing to pay. */
async function payable(token: string) {
  const invoice = await byToken(token);
  if (!invoice)
    throw new HttpError(404, "not_found", "This pay link doesn't work any more. Ask the farm for a new one.");
  return invoice;
}

/**
 * Paystack's checkout for what's left on the invoice (card, bank app, USSD): the page to send the
 * customer to. They come back to the pay page, which confirms the money with Paystack.
 */
export async function checkoutByLink(token: string, origin: string) {
  const invoice = await payable(token);
  if (invoice.state === "void")
    throw new HttpError(409, "void", `${invoice.number} is void, so nothing is owed on it.`);
  const amount = invoice.totalKobo - invoice.paidKobo;
  if (amount <= 0) throw new HttpError(409, "paid", `${invoice.number} is paid in full.`);
  const customer = await CustomerModel.findById(invoice.customerId, { email: 1 }).lean();
  const reference = referenceFor("chk", invoice.number);
  const email = payerEmail(customer?.email, invoice.number);
  const { url } = await startCheckout({
    email,
    amountKobo: amount,
    reference,
    callbackUrl: `${origin}/pay/${token}`,
    metadata: { invoiceId: String(invoice._id), invoiceNumber: invoice.number, farmId: String(invoice.farmId) },
  });
  await CollectionModel.create({
    farmId: invoice.farmId,
    createdBy: null,
    kind: "checkout",
    invoiceId: invoice._id,
    reference,
    amountKobo: amount,
    email,
    authorizationUrl: url,
  });
  return { url };
}

/** A transfer account for the invoice, from its pay link. */
export async function transferByLink(token: string) {
  const invoice = await payable(token);
  return collectByTransfer(String(invoice.farmId), String(invoice._id), "");
}

/** Has a pay link's payment come in? Only for that invoice's own payments. */
export async function checkByLink(token: string, collectionId: string) {
  const invoice = await payable(token);
  const c = await checkCollection(String(invoice.farmId), collectionId);
  if (c.invoiceId !== String(invoice._id)) throw new HttpError(404, "not_found", "That payment isn't here.");
  return c;
}

/**
 * The customer is back from Paystack's checkout with its reference: confirm it with Paystack and
 * record it. Only a reference for this invoice counts; anything else is ignored.
 */
export async function returnFromCheckout(token: string, reference: string) {
  const invoice = await byToken(token);
  if (!invoice || typeof reference !== "string") return false;
  const c = await CollectionModel.findOne({ reference, invoiceId: invoice._id }).lean();
  if (!c) return false;
  if (c.status === "waiting") await settleByReference(reference);
  return (await CollectionModel.findById(c._id).lean())!.status === "paid";
}
