import "server-only";

import { Types } from "mongoose";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { type InvoiceLine, type InvoiceState, type InvoiceStatus, invoiceStatus, invoiceTotals } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { PER_UNIT } from "@/lib/contracts/rules";
import { addDays, isISODate, today as lagosToday } from "@/lib/dates";
import { connectDb, withTransaction } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatNaira } from "@/lib/money";
import { A4, BRAND, MUTED, naira, pdfDay, pen, TINT } from "@/lib/pdf";
import { kg, lineAmount } from "@/lib/sales/rules";
import { nextInvoiceNumber, readSettings } from "@/lib/settings/service";
import { BatchModel } from "@/models/batch";
import { ContractModel } from "@/models/contract";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { SalesOrderModel } from "@/models/sales-order";

export type InvoiceView = {
  id: string;
  version: number;
  number: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  orderIds: string[];
  lines: InvoiceLine[];
  issueDate: string;
  dueDate: string;
  subtotalKobo: number;
  discountKobo: number;
  vatRateBps: number | null;
  vatKobo: number;
  totalKobo: number;
  paidKobo: number;
  balanceKobo: number;
  notes: string;
  state: InvoiceState;
  status: InvoiceStatus;
  sentAt: string | null;
  sentTo: string;
  voidReason: string;
};

/** As stored: every field has a default, so nothing is missing. */
type Doc = {
  _id: unknown;
  __v: number;
  number: string;
  customerId: unknown;
  orderIds: unknown[];
  lines: { orderId: unknown; description: string; amountKobo: number }[];
  issueDate: string;
  dueDate: string;
  subtotalKobo: number;
  discountKobo: number;
  vatRateBps: number | null;
  vatKobo: number;
  totalKobo: number;
  paidKobo: number;
  notes: string;
  state: InvoiceState;
  sentAt: Date | null;
  sentTo: string;
  voidReason: string;
};

type Customers = Map<string, { name: string; email: string }>;

const view = (i: Doc, customers: Customers, today: string): InvoiceView => {
  const c = customers.get(String(i.customerId));
  const paid = i.paidKobo;
  return {
    id: String(i._id),
    version: i.__v,
    number: i.number,
    customerId: String(i.customerId),
    customerName: c?.name ?? "A removed customer",
    customerEmail: c?.email ?? "",
    orderIds: i.orderIds.map(String),
    lines: i.lines.map((l) => ({
      orderId: l.orderId ? String(l.orderId) : null,
      description: l.description,
      amountKobo: l.amountKobo,
    })),
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    subtotalKobo: i.subtotalKobo,
    discountKobo: i.discountKobo,
    vatRateBps: i.vatRateBps,
    vatKobo: i.vatKobo,
    totalKobo: i.totalKobo,
    paidKobo: paid,
    balanceKobo: i.state === "void" ? 0 : Math.max(0, i.totalKobo - paid),
    notes: i.notes,
    state: i.state,
    status: invoiceStatus({ state: i.state, totalKobo: i.totalKobo, paidKobo: paid, dueDate: i.dueDate }, today),
    sentAt: i.sentAt ? i.sentAt.toISOString() : null,
    sentTo: i.sentTo,
    voidReason: i.voidReason,
  };
};

async function customersOf(farmId: string, ids: unknown[]): Promise<Customers> {
  const docs = await CustomerModel.find({ farmId, _id: { $in: [...new Set(ids.map(String))] } }, { name: 1, email: 1 })
    .setOptions({ withDeleted: true })
    .lean();
  return new Map(docs.map((c) => [String(c._id), { name: c.name, email: c.email }]));
}

const views = async (farmId: string, docs: Doc[], today = lagosToday()) => {
  const customers = await customersOf(
    farmId,
    docs.map((d) => d.customerId),
  );
  return docs.map((d) => view(d, customers, today));
};

/** Invoices, newest first; one customer's when `customerId` is given. */
export async function listInvoices(
  farmId: string,
  { customerId, today = lagosToday() }: { customerId?: string; today?: string } = {},
): Promise<InvoiceView[]> {
  await connectDb();
  if (customerId !== undefined && !Types.ObjectId.isValid(customerId)) return [];
  const docs = (await InvoiceModel.find({ farmId, ...(customerId && { customerId }) })
    .sort({ issueDate: -1, number: -1 })
    .lean()) as unknown as Doc[];
  return views(farmId, docs, today);
}

export async function getInvoice(farmId: string, id: string, today = lagosToday()) {
  await connectDb();
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = (await InvoiceModel.findOne({ _id: id, farmId }).lean()) as unknown as Doc | null;
  return doc ? (await views(farmId, [doc], today))[0] : null;
}

/** "200 birds from B-2026-01 · 440 kg at ₦3,200.00 a kg" for each line of an order, and its delivery charge. */
async function linesFor(
  farmId: string,
  orders: {
    _id: unknown;
    number: string;
    lines: { batchId: unknown; birds: number; weightGrams: number; priceKobo: number; pricing: "perKg" | "perBird" }[];
    deliveryKobo: number;
    deliveredOn?: string | null;
  }[],
) {
  const batchIds = orders.flatMap((o) => o.lines.map((l) => l.batchId));
  const batches = await BatchModel.find({ farmId, _id: { $in: batchIds } }, { code: 1 })
    .setOptions({ withDeleted: true })
    .lean();
  const code = new Map(batches.map((b) => [String(b._id), b.code]));
  const lines: { orderId: unknown; description: string; amountKobo: number }[] = [];
  for (const o of orders) {
    const on = o.deliveredOn ? ` on ${pdfDay(o.deliveredOn)}` : "";
    for (const l of o.lines)
      lines.push({
        orderId: o._id,
        description: `${l.birds.toLocaleString("en-NG")} birds from ${code.get(String(l.batchId)) ?? "a batch"}${l.weightGrams ? `, ${kg(l.weightGrams)}` : ""} at ${formatNaira(l.priceKobo)} ${PER_UNIT[l.pricing]} (${o.number}${on})`,
        amountKobo: lineAmount(l),
      });
    if (o.deliveryKobo > 0)
      lines.push({ orderId: o._id, description: `Delivery (${o.number})`, amountKobo: o.deliveryKobo });
  }
  return lines;
}

/**
 * Bills a customer for delivered orders, in one transaction: the next invoice number from
 * Settings is taken, the orders are marked invoiced, and the invoice is written. Two made at the
 * same moment get the next two numbers; one that fails takes none. VAT follows Settings; the due
 * date follows the contract the orders were priced by, or the customer's terms.
 */
export async function createInvoice(actor: CurrentUser, input: Record<string, unknown>, today = lagosToday()) {
  await connectDb();
  const ids = Array.isArray(input.orderIds) ? [...new Set(input.orderIds.map(String))] : [];
  if (!ids.length || ids.some((id) => !Types.ObjectId.isValid(id)))
    throw new HttpError(400, "invalid_invoice", "Choose the delivered orders to invoice.", "orderIds");
  const issueDate = input.issueDate === undefined || input.issueDate === "" ? today : input.issueDate;
  if (typeof issueDate !== "string" || !isISODate(issueDate) || issueDate > today)
    throw new HttpError(400, "invalid_invoice", "Choose the invoice date: today or before.", "issueDate");
  const discountKobo = input.discountKobo ?? 0;
  if (typeof discountKobo !== "number" || !Number.isInteger(discountKobo) || discountKobo < 0)
    throw new HttpError(400, "invalid_invoice", "Enter the discount, or 0.", "discountKobo");
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 500) : "";

  const orders = await SalesOrderModel.find({ farmId: actor.farmId, _id: { $in: ids } }).lean();
  if (orders.length !== ids.length) throw new HttpError(404, "not_found", "One of those orders isn't here any more.");
  const customerId = String(orders[0].customerId);
  if (orders.some((o) => String(o.customerId) !== customerId))
    throw new HttpError(
      400,
      "invalid_invoice",
      "An invoice is for one customer: choose their orders only.",
      "orderIds",
    );
  const notReady = orders.find((o) => o.status !== "delivered");
  if (notReady)
    throw new HttpError(
      409,
      "not_delivered",
      notReady.status === "invoiced"
        ? `${notReady.number} is on an invoice already.`
        : `${notReady.number} isn't delivered yet: invoice it once the birds have gone.`,
      "orderIds",
    );
  const customer = await CustomerModel.findOne({ _id: customerId, farmId: actor.farmId }, { termsDays: 1 }).lean();
  const contractId = orders.find((o) => o.contractId)?.contractId;
  const contract = contractId ? await ContractModel.findById(contractId, { termsDays: 1 }).lean() : null;
  const terms = contract?.termsDays ?? customer?.termsDays ?? (await readSettings(actor.farmId)).paymentTermsDays;
  const settings = await readSettings(actor.farmId);
  const lines = await linesFor(actor.farmId, orders as never);
  const totals = invoiceTotals(lines, discountKobo, settings.vatEnabled ? settings.vatRateBps : null);
  if (discountKobo > totals.subtotalKobo)
    throw new HttpError(400, "invalid_invoice", "The discount is more than the invoice.", "discountKobo");

  const doc = await withTransaction(async (session) => {
    const number = await nextInvoiceNumber(actor.farmId, { now: new Date(`${issueDate}T12:00:00Z`), session });
    const [invoice] = await InvoiceModel.create(
      [
        {
          farmId: actor.farmId,
          createdBy: actor.id,
          number,
          customerId,
          orderIds: ids,
          lines,
          issueDate,
          dueDate: addDays(issueDate, terms),
          ...totals,
          vatRateBps: settings.vatEnabled ? settings.vatRateBps : null,
          notes,
        },
      ],
      { session },
    );
    // Guarded, so two invoices can't take the same order at once.
    const moved = await SalesOrderModel.updateMany(
      { farmId: actor.farmId, _id: { $in: ids }, status: "delivered" },
      { $set: { status: "invoiced", invoiceId: invoice._id } },
      { session },
    );
    if (moved.modifiedCount !== ids.length)
      throw new HttpError(409, "not_delivered", "Someone invoiced one of those orders just now.", "orderIds");
    return invoice;
  });
  return (await views(actor.farmId, [doc.toObject() as unknown as Doc], today))[0];
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id) ? await InvoiceModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!doc) throw new HttpError(404, "not_found", "That invoice isn't here any more.");
  return doc;
}

const stale = () =>
  new HttpError(409, "stale", "Someone changed this invoice while you were working on it. Open it again.");

/** Changes a draft's discount, due date or notes, from a form no older than the last save. */
export async function updateInvoice(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  version: unknown,
  today = lagosToday(),
) {
  const doc = await load(actor, id);
  if (typeof version !== "number" || version !== doc.__v) throw stale();
  if (doc.state !== "draft")
    throw new HttpError(409, "not_draft", `${doc.number} has been sent, so it stays as the customer has it.`);
  const discountKobo = input.discountKobo ?? doc.discountKobo;
  if (
    typeof discountKobo !== "number" ||
    !Number.isInteger(discountKobo) ||
    discountKobo < 0 ||
    discountKobo > doc.subtotalKobo
  )
    throw new HttpError(400, "invalid_invoice", "Enter a discount from 0 to the invoice's amount.", "discountKobo");
  const dueDate = input.dueDate ?? doc.dueDate;
  if (typeof dueDate !== "string" || !isISODate(dueDate) || dueDate < doc.issueDate)
    throw new HttpError(400, "invalid_invoice", "Choose a due date on or after the invoice date.", "dueDate");
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 500) : doc.notes;
  doc.set({ ...invoiceTotals(doc.lines, discountKobo, doc.vatRateBps ?? null), dueDate, notes });
  try {
    await doc.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return (await views(actor.farmId, [doc.toObject() as unknown as Doc], today))[0];
}

/** Emails the invoice as a PDF to the customer (again, if it was sent before). A draft becomes sent. */
export async function sendInvoice(actor: CurrentUser, id: string, origin: string, today = lagosToday()) {
  const doc = await load(actor, id);
  if (doc.state === "void") throw new HttpError(409, "void", `${doc.number} is void, so it isn't sent.`);
  const customer = await CustomerModel.findOne(
    { _id: doc.customerId, farmId: actor.farmId },
    { name: 1, email: 1 },
  ).lean();
  if (!customer?.email)
    throw new HttpError(
      409,
      "no_email",
      `Add ${customer?.name ?? "the customer"}'s email on their page to send them invoices.`,
    );
  const { bytes, filename } = await invoicePdf(actor.farmId, id, today);
  const settings = await readSettings(actor.farmId);
  const v = (await views(actor.farmId, [doc.toObject() as unknown as Doc], today))[0];
  await sendEmail({
    to: customer.email,
    subject: `Invoice ${doc.number} from ${settings.businessName}: ${formatNaira(v.balanceKobo)}`,
    text: [
      `Hello ${customer.name},`,
      "",
      `Here is invoice ${doc.number} for ${formatNaira(doc.totalKobo)}, due on ${pdfDay(doc.dueDate)}.`,
      settings.bankName && settings.accountNumber
        ? `Pay by transfer to ${settings.accountName || settings.businessName}, ${settings.bankName} ${settings.accountNumber}, with ${doc.number} as the reference.`
        : "",
      "The invoice is attached.",
      "",
      settings.businessName,
      origin,
    ]
      .filter((l, i, all) => l !== "" || all[i - 1] !== "")
      .join("\n"),
    attachments: [{ filename, content: Buffer.from(bytes).toString("base64") }],
  });
  doc.set({ state: doc.state === "draft" ? "sent" : doc.state, sentAt: new Date(), sentTo: customer.email });
  await doc.save();
  return (await views(actor.farmId, [doc.toObject() as unknown as Doc], today))[0];
}

/**
 * Voids an invoice made in error: it keeps its number (so none is ever missing) and says why, and
 * its orders can be invoiced again. One with payments on it can't be voided.
 */
export async function voidInvoice(actor: CurrentUser, id: string, reason: unknown, today = lagosToday()) {
  const doc = await load(actor, id);
  if (doc.state === "void") throw new HttpError(409, "void", `${doc.number} is void already.`);
  if (doc.paidKobo > 0)
    throw new HttpError(409, "has_payments", `${doc.number} has payments on it, so it stays. Record a refund instead.`);
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) throw new HttpError(400, "invalid_invoice", "Say why it's void, for the record.", "voidReason");
  await withTransaction(async (session) => {
    doc.$session(session);
    doc.set({ state: "void", voidedAt: new Date(), voidReason: why.slice(0, 300) });
    await doc.save();
    await SalesOrderModel.updateMany(
      { farmId: actor.farmId, invoiceId: doc._id },
      { $set: { status: "delivered", invoiceId: null } },
      { session },
    );
  });
  return (await views(actor.farmId, [doc.toObject() as unknown as Doc], today))[0];
}

/** The invoice as a PDF: the farm, who it's for, each line, the totals, and how to pay. */
export async function invoicePdf(farmId: string, id: string, today = lagosToday()) {
  const invoice = await getInvoice(farmId, id, today);
  if (!invoice) throw new HttpError(404, "not_found", "That invoice isn't here any more.");
  const [settings, customer] = await Promise.all([
    readSettings(farmId),
    CustomerModel.findOne({ _id: invoice.customerId, farmId }).setOptions({ withDeleted: true }).lean(),
  ]);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${invoice.number}`);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage(A4);
  let { left, right, text, fit, rule } = pen(page, regular);
  let y = A4[1] - 64;

  text(settings.businessName || "Farm", left, y, { font: bold, size: 18 });
  text(invoice.state === "void" ? "VOID INVOICE" : "INVOICE", right, y, {
    font: bold,
    size: 18,
    color: BRAND,
    align: "right",
  });
  y -= 16;
  for (const l of [settings.address, settings.phone, settings.email].filter(Boolean)) {
    text(l, left, y, { color: MUTED, size: 9 });
    y -= 12;
  }
  let ry = A4[1] - 80;
  for (const [label, value] of [
    ["Number", invoice.number],
    ["Date", pdfDay(invoice.issueDate)],
    ["Due", pdfDay(invoice.dueDate)],
  ]) {
    text(label, right - 150, ry, { color: MUTED });
    text(value, right, ry, { font: bold, align: "right" });
    ry -= 14;
  }
  y = Math.min(y, ry) - 18;
  rule(y);
  y -= 22;
  text("Bill to", left, y, { color: MUTED });
  y -= 14;
  text(invoice.customerName, left, y, { font: bold, size: 12 });
  y -= 14;
  for (const l of [customer?.contactName, customer?.address, customer?.email].filter(Boolean) as string[]) {
    text(l, left, y, { color: MUTED, size: 9 });
    y -= 12;
  }
  y -= 18;

  text("Description", left, y, { font: bold });
  text("Amount", right, y, { font: bold, align: "right" });
  y -= 8;
  rule(y);
  y -= 16;
  for (const l of invoice.lines) {
    if (y < 160) {
      page = pdf.addPage(A4);
      ({ left, right, text, fit, rule } = pen(page, regular));
      y = A4[1] - 64;
    }
    text(fit(l.description, right - left - 110), left, y);
    text(naira(l.amountKobo), right, y, { align: "right" });
    y -= 16;
  }
  rule(y + 6);
  y -= 12;
  const total = (label: string, kobo: number, strong = false) => {
    text(label, right - 200, y, { color: strong ? undefined : MUTED, font: strong ? bold : regular });
    text(naira(kobo), right, y, { font: strong ? bold : regular, align: "right" });
    y -= 16;
  };
  total("Subtotal", invoice.subtotalKobo);
  if (invoice.discountKobo) total("Discount", -invoice.discountKobo);
  if (invoice.vatRateBps) total(`VAT ${invoice.vatRateBps / 100}%`, invoice.vatKobo);
  total("Total", invoice.totalKobo, true);
  if (invoice.paidKobo) total("Paid", -invoice.paidKobo);
  y -= 6;
  page.drawRectangle({ x: right - 230, y: y - 10, width: 230, height: 30, color: TINT });
  text("Balance due", right - 220, y, { font: bold, size: 12 });
  text(naira(invoice.balanceKobo), right - 10, y, { font: bold, size: 12, color: BRAND, align: "right" });
  y -= 44;

  if (invoice.state === "void") {
    text(`Void: ${invoice.voidReason}`, left, y, { font: bold, color: MUTED });
    y -= 16;
  } else if (settings.bankName && settings.accountNumber) {
    text("How to pay", left, y, { font: bold });
    y -= 14;
    text(
      `Transfer to ${settings.accountName || settings.businessName}, ${settings.bankName} ${settings.accountNumber}.`,
      left,
      y,
    );
    y -= 14;
    text(`Use ${invoice.number} as the reference.`, left, y, { color: MUTED });
    y -= 16;
  }
  if (invoice.notes) text(fit(invoice.notes, right - left), left, y, { color: MUTED });
  text(`${settings.businessName} · Invoice ${invoice.number}`, left, 48, { size: 8, color: MUTED });

  return {
    bytes: await pdf.save(),
    filename: `Invoice ${invoice.number}.pdf`.replace(/[^\w .-]/g, ""),
  };
}
