import "server-only";

import { Types } from "mongoose";

import { PAYMENT_METHODS, type PaymentMethod } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { isISODate, today as lagosToday } from "@/lib/dates";
import { connectDb, withTransaction } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";

export type PaymentView = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  amountKobo: number;
  method: PaymentMethod;
  reference: string;
  date: string;
  notes: string;
};

type Doc = {
  _id: unknown;
  invoiceId: unknown;
  customerId: unknown;
  amountKobo: number;
  method: PaymentMethod;
  reference: string;
  date: string;
  notes: string;
};

async function views(farmId: string, docs: Doc[]): Promise<PaymentView[]> {
  const invoices = await InvoiceModel.find({ farmId, _id: { $in: docs.map((d) => d.invoiceId) } }, { number: 1 })
    .setOptions({ withDeleted: true })
    .lean();
  const numbers = new Map(invoices.map((i) => [String(i._id), i.number]));
  return docs.map((p) => ({
    id: String(p._id),
    invoiceId: String(p.invoiceId),
    invoiceNumber: numbers.get(String(p.invoiceId)) ?? "",
    customerId: String(p.customerId),
    amountKobo: p.amountKobo,
    method: p.method,
    reference: p.reference,
    date: p.date,
    notes: p.notes,
  }));
}

/** Payments, newest first: on one invoice, or from one customer. */
export async function listPayments(
  farmId: string,
  { invoiceId, customerId }: { invoiceId?: string; customerId?: string },
) {
  await connectDb();
  if ((invoiceId && !Types.ObjectId.isValid(invoiceId)) || (customerId && !Types.ObjectId.isValid(customerId)))
    return [];
  const docs = (await PaymentModel.find({ farmId, ...(invoiceId && { invoiceId }), ...(customerId && { customerId }) })
    .sort({ date: -1, _id: -1 })
    .lean()) as unknown as Doc[];
  return views(farmId, docs);
}

/**
 * Records money a customer paid on an invoice, in part or in full. In one transaction: the
 * payment is written and the invoice's paid amount goes up, guarded so two payments recorded at
 * once can't together pay more than it's for. Paying what's left makes it paid.
 */
export async function recordPayment(
  actor: CurrentUser,
  invoiceId: string,
  input: Record<string, unknown>,
  today = lagosToday(),
) {
  await connectDb();
  const invoice = Types.ObjectId.isValid(invoiceId)
    ? await InvoiceModel.findOne({ _id: invoiceId, farmId: actor.farmId }).lean()
    : null;
  if (!invoice) throw new HttpError(404, "not_found", "That invoice isn't here any more.");
  if (invoice.state === "void")
    throw new HttpError(409, "void", `${invoice.number} is void, so nothing is owed on it.`);
  const left = invoice.totalKobo - invoice.paidKobo;
  if (left <= 0) throw new HttpError(409, "paid", `${invoice.number} is paid in full.`);
  const amount = input.amountKobo;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1)
    throw new HttpError(400, "invalid_payment", "Enter how much they paid.", "amountKobo");
  if (amount > left)
    throw new HttpError(
      400,
      "invalid_payment",
      `Only ${formatNaira(left)} is left to pay on ${invoice.number}.`,
      "amountKobo",
    );
  if (!PAYMENT_METHODS.includes(input.method as PaymentMethod))
    throw new HttpError(400, "invalid_payment", "Choose how they paid.", "method");
  const date = input.date === undefined || input.date === "" ? today : input.date;
  if (typeof date !== "string" || !isISODate(date) || date > today)
    throw new HttpError(400, "invalid_payment", "Choose the day they paid: today or before.", "date");
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  const payment = await withTransaction(async (session) => {
    const moved = await InvoiceModel.updateOne(
      {
        _id: invoice._id,
        state: { $ne: "void" },
        $expr: { $lte: [{ $add: ["$paidKobo", amount] }, "$totalKobo"] },
      },
      { $inc: { paidKobo: amount } },
      { session },
    );
    if (!moved.modifiedCount)
      throw new HttpError(409, "paid", `Someone recorded a payment on ${invoice.number} just now. Open it again.`);
    const [p] = await PaymentModel.create(
      [
        {
          farmId: actor.farmId,
          createdBy: actor.id,
          invoiceId: invoice._id,
          customerId: invoice.customerId,
          amountKobo: amount,
          method: input.method as PaymentMethod,
          reference: text(input.reference, 100),
          date,
          notes: text(input.notes, 300),
        },
      ],
      { session },
    );
    return p;
  });
  return (await views(actor.farmId, [payment.toObject() as unknown as Doc]))[0];
}

/** Takes back a payment recorded by mistake: the invoice owes it again. Kept, hidden and audited. */
export async function removePayment(actor: CurrentUser, id: string) {
  await connectDb();
  const payment = Types.ObjectId.isValid(id) ? await PaymentModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!payment) throw new HttpError(404, "not_found", "That payment isn't here any more.");
  await withTransaction(async (session) => {
    payment.$session(session);
    await payment.softDelete();
    await InvoiceModel.updateOne({ _id: payment.invoiceId }, { $inc: { paidKobo: -payment.amountKobo } }, { session });
  });
}
