import "server-only";

import { Types } from "mongoose";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { AGING_BANDS, type AgingBand, agingBand } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { type DateRange, isISODate, today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatNaira } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payments/rules";
import { A4, BRAND, MUTED, naira, pdfDay, pen, TINT } from "@/lib/pdf";
import { readSettings } from "@/lib/settings/service";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";

export type StatementEntry = {
  date: string;
  kind: "invoice" | "payment";
  description: string;
  /** What they were billed (invoices) or paid (payments). */
  debitKobo: number;
  creditKobo: number;
  balanceKobo: number;
  invoiceId: string;
};

export type Statement = {
  customer: { id: string; name: string; email: string; address: string };
  range: DateRange;
  openingKobo: number;
  entries: StatementEntry[];
  closingKobo: number;
  billedKobo: number;
  paidKobo: number;
};

/** Invoices the customer has: sent ones, and a draft once money is paid on it. */
export const BILLED = { $or: [{ state: "sent" as const }, { state: "draft" as const, paidKobo: { $gt: 0 } }] };

function checkRange(range: Partial<DateRange>, today: string): DateRange {
  const from = range.from ?? "";
  const to = range.to || today;
  if (!isISODate(from) || !isISODate(to) || from > to)
    throw new HttpError(400, "invalid_range", "Choose a start date on or before the end date.", "from");
  return { from, to };
}

/**
 * A customer's statement for a range: what they owed going in, every invoice and payment in it
 * with the balance after each, and what they owe at the end. It's what the customer has been
 * sent: drafts still being checked stay off (unless money was paid on one), void invoices and
 * payments taken back don't count. Closing on today, it equals what's left on those invoices.
 */
export async function statementFor(
  farmId: string,
  customerId: string,
  range: Partial<DateRange>,
  today = lagosToday(),
): Promise<Statement> {
  await connectDb();
  const customer = Types.ObjectId.isValid(customerId)
    ? await CustomerModel.findOne({ _id: customerId, farmId }).lean()
    : null;
  if (!customer) throw new HttpError(404, "not_found", "That customer isn't on the list any more.");
  const { from, to } = checkRange(range, today);
  const [invoices, payments] = await Promise.all([
    InvoiceModel.find(
      { farmId, customerId, ...BILLED, issueDate: { $lte: to } },
      { number: 1, issueDate: 1, totalKobo: 1, dueDate: 1 },
    ).lean(),
    PaymentModel.find({ farmId, customerId, date: { $lte: to } }).lean(),
  ]);
  const numbers = new Map(invoices.map((i) => [String(i._id), i.number]));
  const before = (date: string) => date < from;
  const openingKobo =
    invoices.filter((i) => before(i.issueDate)).reduce((n, i) => n + i.totalKobo, 0) -
    payments.filter((p) => before(p.date)).reduce((n, p) => n + p.amountKobo, 0);
  const rows = [
    ...invoices
      .filter((i) => !before(i.issueDate))
      .map((i) => ({
        date: i.issueDate,
        kind: "invoice" as const,
        description: `Invoice ${i.number}, due ${pdfDay(i.dueDate)}`,
        debitKobo: i.totalKobo,
        creditKobo: 0,
        invoiceId: String(i._id),
      })),
    ...payments
      .filter((p) => !before(p.date))
      .map((p) => ({
        date: p.date,
        kind: "payment" as const,
        description: `Payment for ${numbers.get(String(p.invoiceId)) ?? "an invoice"}, ${PAYMENT_METHOD_LABELS[p.method as PaymentMethod]}${p.reference ? ` (${p.reference})` : ""}`,
        debitKobo: 0,
        creditKobo: p.amountKobo,
        invoiceId: String(p.invoiceId),
      })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "invoice" ? -1 : 1));
  let balance = openingKobo;
  const entries = rows.map((r) => {
    balance += r.debitKobo - r.creditKobo;
    return { ...r, balanceKobo: balance };
  });
  return {
    customer: { id: String(customer._id), name: customer.name, email: customer.email, address: customer.address },
    range: { from, to },
    openingKobo,
    entries,
    closingKobo: balance,
    billedKobo: entries.reduce((n, e) => n + e.debitKobo, 0),
    paidKobo: entries.reduce((n, e) => n + e.creditKobo, 0),
  };
}

/** The statement as a PDF: the farm, the customer, the range, every line and the balances. */
export async function statementPdf(
  farmId: string,
  customerId: string,
  range: Partial<DateRange>,
  today = lagosToday(),
) {
  const s = await statementFor(farmId, customerId, range, today);
  const settings = await readSettings(farmId);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Statement ${s.customer.name}`);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage(A4);
  let { left, right, text, fit, rule } = pen(page, regular);
  let y = A4[1] - 64;
  text(settings.businessName || "Farm", left, y, { font: bold, size: 18 });
  text("STATEMENT", right, y, { font: bold, size: 18, color: BRAND, align: "right" });
  y -= 18;
  text(`${pdfDay(s.range.from)} to ${pdfDay(s.range.to)}`, right, y, { color: MUTED, align: "right" });
  text(s.customer.name, left, y, { font: bold, size: 12 });
  y -= 14;
  if (s.customer.address) {
    text(s.customer.address, left, y, { color: MUTED, size: 9 });
    y -= 12;
  }
  y -= 14;
  rule(y);
  y -= 20;

  const cols = { date: left, what: left + 70, debit: right - 160, credit: right - 80, balance: right };
  const header = () => {
    text("Date", cols.date, y, { font: bold });
    text("Details", cols.what, y, { font: bold });
    text("Billed", cols.debit, y, { font: bold, align: "right" });
    text("Paid", cols.credit, y, { font: bold, align: "right" });
    text("Balance", cols.balance, y, { font: bold, align: "right" });
    y -= 8;
    rule(y);
    y -= 16;
  };
  header();
  text(pdfDay(s.range.from), cols.date, y);
  text("Owed at the start", cols.what, y, { color: MUTED });
  text(naira(s.openingKobo), cols.balance, y, { align: "right" });
  y -= 16;
  for (const e of s.entries) {
    if (y < 120) {
      page = pdf.addPage(A4);
      ({ left, right, text, fit, rule } = pen(page, regular));
      y = A4[1] - 64;
      header();
    }
    text(pdfDay(e.date), cols.date, y, { size: 9 });
    text(fit(e.description, cols.debit - cols.what - 70, regular, 9), cols.what, y, { size: 9 });
    if (e.debitKobo) text(naira(e.debitKobo), cols.debit, y, { align: "right", size: 9 });
    if (e.creditKobo) text(naira(e.creditKobo), cols.credit, y, { align: "right", size: 9 });
    text(naira(e.balanceKobo), cols.balance, y, { align: "right", size: 9 });
    y -= 15;
  }
  rule(y + 6);
  y -= 24;
  page.drawRectangle({ x: right - 230, y: y - 10, width: 230, height: 30, color: TINT });
  text("Owed now", right - 220, y, { font: bold, size: 12 });
  text(naira(s.closingKobo), right - 10, y, { font: bold, size: 12, color: BRAND, align: "right" });
  y -= 40;
  if (settings.bankName && settings.accountNumber)
    text(
      `Pay by transfer to ${settings.accountName || settings.businessName}, ${settings.bankName} ${settings.accountNumber}.`,
      left,
      y,
    );
  text(`${settings.businessName} · Statement for ${s.customer.name}`, left, 48, { size: 8, color: MUTED });
  return {
    statement: s,
    bytes: await pdf.save(),
    filename: `Statement ${s.customer.name} ${s.range.from} to ${s.range.to}.pdf`.replace(/[^\w .-]/g, ""),
  };
}

/** Emails a customer their statement as a PDF. */
export async function emailStatement(
  actor: CurrentUser,
  customerId: string,
  range: Partial<DateRange>,
  today = lagosToday(),
) {
  const { statement, bytes, filename } = await statementPdf(actor.farmId, customerId, range, today);
  const to = statement.customer.email;
  if (!to)
    throw new HttpError(409, "no_email", `Add ${statement.customer.name}'s email on their page to send statements.`);
  const settings = await readSettings(actor.farmId);
  await sendEmail({
    to,
    subject: `Your statement from ${settings.businessName}: ${formatNaira(statement.closingKobo)} owed`,
    text: [
      `Hello ${statement.customer.name},`,
      "",
      `Your statement from ${pdfDay(statement.range.from)} to ${pdfDay(statement.range.to)} is attached. You owed ${formatNaira(statement.openingKobo)} at the start, and ${formatNaira(statement.closingKobo)} at the end.`,
      "",
      settings.businessName,
    ].join("\n"),
    attachments: [{ filename, content: Buffer.from(bytes).toString("base64") }],
  });
  return { to };
}

export type AgingRow = {
  customerId: string;
  name: string;
  bands: Record<AgingBand, number>;
  totalKobo: number;
  invoices: number;
};
export type Aging = { rows: AgingRow[]; bands: Record<AgingBand, number>; totalKobo: number };

const zero = () => Object.fromEntries(AGING_BANDS.map((b) => [b, 0])) as Record<AgingBand, number>;

/**
 * Who owes what, and how late: what's left on every invoice that isn't void or paid, grouped by
 * days past its due date, per customer and in all. Biggest debts first.
 */
export async function aging(farmId: string, today = lagosToday()): Promise<Aging> {
  await connectDb();
  const invoices = await InvoiceModel.find(
    { farmId, state: { $ne: "void" }, $expr: { $gt: ["$totalKobo", "$paidKobo"] } },
    { customerId: 1, totalKobo: 1, paidKobo: 1, dueDate: 1 },
  ).lean();
  const customers = await CustomerModel.find({ farmId, _id: { $in: invoices.map((i) => i.customerId) } }, { name: 1 })
    .setOptions({ withDeleted: true })
    .lean();
  const names = new Map(customers.map((c) => [String(c._id), c.name]));
  const rows = new Map<string, AgingRow>();
  const bands = zero();
  for (const i of invoices) {
    const id = String(i.customerId);
    const row = rows.get(id) ?? {
      customerId: id,
      name: names.get(id) ?? "A removed customer",
      bands: zero(),
      totalKobo: 0,
      invoices: 0,
    };
    const left = i.totalKobo - i.paidKobo;
    const band = agingBand(i.dueDate, today);
    row.bands[band] += left;
    row.totalKobo += left;
    row.invoices += 1;
    bands[band] += left;
    rows.set(id, row);
  }
  const list = [...rows.values()].sort((a, b) => b.totalKobo - a.totalKobo || a.name.localeCompare(b.name));
  return { rows: list, bands, totalKobo: list.reduce((n, r) => n + r.totalKobo, 0) };
}
