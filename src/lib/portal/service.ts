import "server-only";

import { Types } from "mongoose";

import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { listContracts } from "@/lib/contracts/service";
import { today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { getInvoice, invoicePdf, listInvoices } from "@/lib/invoices/service";
import { listPayments } from "@/lib/payments/service";
import { listOrders } from "@/lib/sales/service";
import { readSettings } from "@/lib/settings/service";
import { statementPdf } from "@/lib/statements/service";
import type { DateRange } from "@/lib/dates";
import { CustomerModel } from "@/models/customer";

/**
 * The customer a portal login sees, or a refusal: only customers, and only the customer their
 * invite linked them to. Everything else in the portal goes through this, so a customer only ever
 * sees their own.
 */
export async function portalCustomer(user: CurrentUser) {
  if (user.role !== "customer") throw new HttpError(403, "forbidden", "The portal is for customers.");
  await connectDb();
  const customer = await CustomerModel.findOne({ farmId: user.farmId, userId: user.id }).lean();
  if (!customer)
    throw new HttpError(
      404,
      "no_customer",
      "Your login isn't linked to a customer yet. Ask the farm to invite you again.",
    );
  return customer;
}

/** Everything a customer sees on their portal page: what they owe, invoices, orders and contracts, and how to pay. */
export async function portalHome(user: CurrentUser, today = lagosToday()) {
  const customer = await portalCustomer(user);
  const id = String(customer._id);
  const [invoices, orders, contracts, settings] = await Promise.all([
    listInvoices(user.farmId, { customerId: id, today }),
    listOrders(user.farmId, { customerId: id }),
    listContracts(user.farmId, { customerId: id, today }),
    readSettings(user.farmId),
  ]);
  // Drafts are the farm's business until they're sent (or paid on); void ones are gone.
  const shown = invoices.filter((i) => i.state === "sent" || (i.state === "draft" && i.paidKobo > 0));
  return {
    customer: { id, name: customer.name, termsDays: customer.termsDays },
    farm: {
      name: settings.businessName,
      phone: settings.phone,
      email: settings.email,
      bank:
        settings.bankName && settings.accountNumber
          ? {
              bankName: settings.bankName,
              accountNumber: settings.accountNumber,
              accountName: settings.accountName || settings.businessName,
            }
          : null,
    },
    owedKobo: shown.reduce((n, i) => n + i.balanceKobo, 0),
    invoices: shown,
    orders: orders.filter((o) => o.status !== "cancelled"),
    contracts: contracts.filter((c) => c.status !== "draft"),
  };
}

export type PortalHome = Awaited<ReturnType<typeof portalHome>>;

/** One of the customer's own invoices with its payments; anyone else's is "not found". */
export async function portalInvoice(user: CurrentUser, id: string, today = lagosToday()) {
  const customer = await portalCustomer(user);
  const invoice = Types.ObjectId.isValid(id) ? await getInvoice(user.farmId, id, today) : null;
  const theirs = invoice?.state === "sent" || (invoice?.state === "draft" && invoice.paidKobo > 0);
  if (!invoice || invoice.customerId !== String(customer._id) || !theirs)
    throw new HttpError(404, "not_found", "That invoice isn't here.");
  return { invoice, payments: await listPayments(user.farmId, { invoiceId: id }) };
}

export async function portalInvoicePdf(user: CurrentUser, id: string, today = lagosToday()) {
  await portalInvoice(user, id, today);
  return invoicePdf(user.farmId, id, today);
}

export async function portalStatementPdf(user: CurrentUser, range: Partial<DateRange>, today = lagosToday()) {
  const customer = await portalCustomer(user);
  return statementPdf(user.farmId, String(customer._id), range, today);
}
