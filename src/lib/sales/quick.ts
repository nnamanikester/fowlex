import "server-only";

import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { type CollectionView, collectByTransfer } from "@/lib/collections/service";
import { PRICINGS, type Pricing } from "@/lib/contracts/rules";
import { walkInCustomer } from "@/lib/customers/service";
import { today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { createInvoice, getInvoice, type InvoiceView } from "@/lib/invoices/service";
import { recordPayment } from "@/lib/payments/service";
import { createOrder, deliverOrder } from "@/lib/sales/service";
import { findOrAddCustomer, sellable } from "@/lib/shop/service";
import { normalisePhone } from "@/lib/suppliers/rules";
import { InvoiceModel } from "@/models/invoice";
import { SalesOrderModel } from "@/models/sales-order";

export const PAID_BY = ["cash", "transfer", "later"] as const;
export type PaidBy = (typeof PAID_BY)[number];

export type QuickSale = {
  invoice: InvoiceView;
  /** The account to pay into, when they pay by transfer. */
  collection: CollectionView | null;
};

/**
 * Sells birds over the counter in one go, to anyone: no customer needs adding first. The birds
 * come off the batches (the one chosen, or the oldest), the order is delivered and an invoice
 * made and handed over at once; then it's paid in cash, given a bank account to transfer to
 * (paid by itself when the money lands), or left to pay later. A phone or email finds or adds the
 * customer; with neither, it's a walk-in.
 */
export async function quickSale(
  actor: CurrentUser,
  input: Record<string, unknown>,
  today = lagosToday(),
): Promise<QuickSale> {
  await connectDb();
  const birds = input.birds;
  if (typeof birds !== "number" || !Number.isInteger(birds) || birds < 1)
    throw new HttpError(400, "invalid_sale", "Enter how many birds.", "birds");
  const pricing = input.pricing as Pricing;
  if (!PRICINGS.includes(pricing)) throw new HttpError(400, "invalid_sale", "Choose per kg or per bird.", "pricing");
  const price = input.priceKobo;
  if (typeof price !== "number" || !Number.isInteger(price) || price < 1)
    throw new HttpError(400, "invalid_sale", "Enter the price.", "priceKobo");
  const grams = input.weightGrams ?? 0;
  if (typeof grams !== "number" || !Number.isInteger(grams) || grams < 0)
    throw new HttpError(400, "invalid_sale", "Enter their weight in kg.", "weightGrams");
  if (pricing === "perKg" && grams < 1)
    throw new HttpError(400, "invalid_sale", "Weigh the birds: the price is per kg.", "weightGrams");
  const paidBy = input.paidBy as PaidBy;
  if (!PAID_BY.includes(paidBy)) throw new HttpError(400, "invalid_sale", "Choose how they pay.", "paidBy");
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = text(input.name, 80);
  const email = text(input.email, 200).toLowerCase();
  const phoneText = text(input.phone, 30);
  const phone = phoneText ? normalisePhone(phoneText) : null;
  if (phoneText && !phone)
    throw new HttpError(400, "invalid_sale", "Check the phone number, or leave it empty.", "phone");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new HttpError(400, "invalid_sale", "Check the email, or leave it empty.", "email");

  // Birds from the batch chosen, or the oldest first: they're in hand, so any batch with birds.
  const batches = (await sellable(actor.farmId, today)).filter((b) => !input.batchId || b.id === input.batchId);
  const free = batches.reduce((n, b) => n + b.free, 0);
  if (birds > free)
    throw new HttpError(
      409,
      "not_enough_birds",
      free ? `There are ${free.toLocaleString("en-NG")} birds free to sell.` : "There are no birds free to sell.",
      "birds",
    );
  let left = birds;
  const take: { batchId: string; birds: number }[] = [];
  for (const b of batches) {
    if (!left) break;
    const n = Math.min(left, b.free);
    take.push({ batchId: b.id, birds: n });
    left -= n;
  }

  const customer =
    phone || email
      ? await findOrAddCustomer(actor.farmId, {
          name: name || "Customer",
          phone: phone ?? "",
          email,
          business: "",
          address: "",
          birds,
          date: today,
          delivery: false,
          notes: "",
        })
      : await walkInCustomer(actor.farmId);

  // The weight is shared across batches by their birds, so each line is priced right.
  const lines = take.map((t, i) => ({
    batchId: t.batchId,
    birds: t.birds,
    weightGrams:
      i === take.length - 1
        ? grams - take.slice(0, -1).reduce((n, x) => n + Math.round((grams * x.birds) / birds), 0)
        : Math.round((grams * t.birds) / birds),
    priceKobo: price,
    pricing,
  }));
  const order = await createOrder(actor, {
    customerId: String(customer._id),
    deliveryDate: today,
    lines,
    deliveryKobo: 0,
    notes: name && !phone && !email ? `Sold to ${name}` : "Sold over the counter",
    confirm: true,
  });
  await SalesOrderModel.updateOne(
    { _id: order.id },
    {
      $set: {
        contact:
          name || phone || email
            ? { name, phone: phone ?? "", email, business: "", delivery: false, address: "" }
            : null,
      },
    },
  );
  const delivered = await deliverOrder(actor, order.id, { confirm: true }, order.version, today);
  const made = await createInvoice(actor, { orderIds: [delivered.id] }, today);
  // Handed over in person: it's issued, whether or not there's an email to send it to.
  await InvoiceModel.updateOne(
    { _id: made.id, state: "draft" },
    { $set: { state: "sent", sentAt: new Date(), sentTo: "" } },
  );

  let collection: CollectionView | null = null;
  if (paidBy === "cash")
    await recordPayment(
      actor,
      made.id,
      { amountKobo: made.totalKobo, method: "cash", notes: "Paid in cash at the sale" },
      today,
    );
  else if (paidBy === "transfer") collection = await collectByTransfer(actor.farmId, made.id, actor.id);
  return { invoice: (await getInvoice(actor.farmId, made.id, today))!, collection };
}
