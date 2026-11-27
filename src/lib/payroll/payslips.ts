import "server-only";

import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import { Types } from "mongoose";

import { HttpError } from "@/lib/auth/guard";
import { formatRange } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { monthName } from "@/lib/people/advance-rules";
import { PAY_TYPE_LABELS, type PayType } from "@/lib/people/rules";
import { maskAccount } from "@/lib/suppliers/rules";
import { EmployeeModel } from "@/models/employee";
import { ExpenseModel } from "@/models/expense";
import { FarmModel } from "@/models/farm";
import { PayrollRunModel } from "@/models/payroll-run";

export type Payslip = {
  lineId: string;
  runId: string;
  number: string;
  period: string;
  farm: string;
  name: string;
  job: string;
  payType: PayType;
  basis: string;
  grossKobo: number;
  bonusKobo: number;
  advanceKobo: number;
  deductionKobo: number;
  deductionNote: string;
  netKobo: number;
  bank: string;
  email: string;
  paidOn: string | null;
  paymentStatus: string;
  method: string;
  emailedAt: string | null;
};

const METHODS: Record<string, string> = {
  paystack: "Paystack transfer",
  transfer: "bank transfer",
  cash: "cash",
  pos: "POS",
};

type Line = {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  name: string;
  job?: string;
  payType: PayType;
  basis?: string;
  grossKobo: number;
  bonusKobo: number;
  advanceKobo: number;
  deductionKobo: number;
  deductionNote?: string;
  netKobo: number;
  excluded: boolean;
  emailedAt?: Date | null;
};
type Run = {
  _id: Types.ObjectId;
  farmId: Types.ObjectId;
  number: string;
  period: string;
  status: string;
  lines: Line[];
};

/** The payslips of approved runs: all of a run's, or one person's across runs. */
async function payslips(
  farmId: string,
  filter: { runId?: string; employeeId?: string; lineId?: string },
): Promise<Payslip[]> {
  await connectDb();
  const runs = (await PayrollRunModel.find({
    farmId,
    status: "approved",
    ...(filter.runId && { _id: filter.runId }),
    ...(filter.employeeId && { "lines.employeeId": filter.employeeId }),
    ...(filter.lineId && { "lines._id": filter.lineId }),
  })
    .sort({ period: -1 })
    .lean()) as unknown as Run[];
  const lines = runs.flatMap((run) =>
    run.lines
      .map((line, i) => ({ run, line, n: i + 1 }))
      .filter(
        ({ line }) =>
          !line.excluded &&
          (line.netKobo > 0 || line.advanceKobo > 0) &&
          (!filter.employeeId || String(line.employeeId) === filter.employeeId) &&
          (!filter.lineId || String(line._id) === filter.lineId),
      ),
  );
  const [farm, people, expenses] = await Promise.all([
    FarmModel.findById(farmId, { name: 1 }).lean(),
    EmployeeModel.find({ _id: { $in: lines.map((l) => l.line.employeeId) } }, { email: 1, bank: 1 })
      .setOptions({ withDeleted: true })
      .lean(),
    ExpenseModel.find(
      { "source.kind": "payslip", "source.id": { $in: lines.map((l) => l.line._id) } },
      { paymentStatus: 1, paidOn: 1, method: 1, source: 1 },
    ).lean(),
  ]);
  const person = new Map(people.map((p) => [String(p._id), p]));
  const paid = new Map(expenses.map((e) => [String(e.source!.id), e]));
  return lines.map(({ run, line, n }) => {
    const p = person.get(String(line.employeeId));
    const e = paid.get(String(line._id));
    return {
      lineId: String(line._id),
      runId: String(run._id),
      number: `${run.number}-${String(n).padStart(2, "0")}`,
      period: run.period,
      farm: farm?.name ?? "",
      name: line.name,
      job: line.job ?? "",
      payType: line.payType,
      basis: line.basis ?? "",
      grossKobo: line.grossKobo,
      bonusKobo: line.bonusKobo,
      advanceKobo: line.advanceKobo,
      deductionKobo: line.deductionKobo,
      deductionNote: line.deductionNote ?? "",
      netKobo: line.netKobo,
      bank: p?.bank ? `${p.bank.bankName} ${maskAccount(p.bank.accountNumber)}` : "",
      email: p?.email ?? "",
      paidOn: e?.paymentStatus === "paid" ? (e.paidOn ?? null) : null,
      paymentStatus: e?.paymentStatus ?? (line.netKobo > 0 ? "unpaid" : "paid"),
      method: e?.method ?? "",
      emailedAt: line.emailedAt ? line.emailedAt.toISOString() : null,
    };
  });
}

/** Someone's payslips, newest month first. */
export const listPayslips = (farmId: string, employeeId: string) =>
  Types.ObjectId.isValid(employeeId) ? payslips(farmId, { employeeId }) : Promise.resolve([]);

/** An approved run's payslips (or one of them) as a PDF, one page each. */
export async function payslipPdf(farmId: string, runId: string, lineId?: string) {
  if (!Types.ObjectId.isValid(runId) || (lineId && !Types.ObjectId.isValid(lineId)))
    throw new HttpError(404, "not_found", "That payslip doesn't exist.");
  const slips = await payslips(farmId, { runId, lineId });
  if (!slips.length) throw new HttpError(404, "not_found", "There are no payslips here yet: approve the pay first.");
  const one = lineId ? slips[0] : null;
  return {
    bytes: await render(slips),
    filename: one
      ? `Payslip ${one.period} ${ascii(one.name)}.pdf`.replace(/[^\w .-]/g, "")
      : `Payslips ${slips[0].period}.pdf`,
  };
}

/**
 * Emails someone their payslip once their pay is paid (Paystack or cash). Quietly skipped for
 * anyone with no email, and for expenses that aren't payslips.
 */
export async function emailPayslip(expenseId: string, { force = false }: { force?: boolean } = {}) {
  await connectDb();
  const expense = await ExpenseModel.findById(expenseId, { farmId: 1, source: 1, paymentStatus: 1 }).lean();
  if (!expense || expense.source?.kind !== "payslip" || !expense.source.id) return false;
  if (!force && expense.paymentStatus !== "paid") return false;
  const [slip] = await payslips(String(expense.farmId), { lineId: String(expense.source.id) });
  if (!slip?.email || (!force && slip.emailedAt)) return false;
  const pdf = await render([slip]);
  const month = monthName(slip.period);
  await sendEmail({
    to: slip.email,
    subject: `Your payslip for ${month}`,
    text: [
      `Hello ${slip.name.split(" ")[0]},`,
      "",
      slip.paidOn
        ? `Your pay for ${month}, ${naira(slip.netKobo)}, was paid on ${day(slip.paidOn)}.`
        : `Your pay for ${month} is ${naira(slip.netKobo)}.`,
      "Your payslip is attached.",
      "",
      slip.farm,
    ].join("\n"),
    attachments: [{ filename: `Payslip ${slip.period}.pdf`, content: Buffer.from(pdf).toString("base64") }],
  });
  await PayrollRunModel.updateOne({ "lines._id": slip.lineId }, { $set: { "lines.$.emailedAt": new Date() } });
  return true;
}

/** Emails a payslip again, whether or not it's paid yet. */
export async function resendPayslip(farmId: string, runId: string, lineId: string) {
  const [slip] =
    Types.ObjectId.isValid(lineId) && Types.ObjectId.isValid(runId) ? await payslips(farmId, { runId, lineId }) : [];
  if (!slip) throw new HttpError(404, "not_found", "That payslip doesn't exist.");
  if (!slip.email) throw new HttpError(409, "no_email", `Add ${slip.name}'s email on People to send them payslips.`);
  const expense = await ExpenseModel.findOne({ "source.kind": "payslip", "source.id": lineId }, { _id: 1 }).lean();
  if (!expense) throw new HttpError(409, "no_pay", `${slip.name} has nothing to be paid this month.`);
  await emailPayslip(String(expense._id), { force: true });
  return { to: slip.email };
}

// PDF text: the standard fonts cover Latin-1 and a few more, so ₦ becomes NGN and accents drop.
const ascii = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/₦/g, "NGN ")
    .replace(/[−–]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF•—×½]/g, "");
const naira = (kobo: number) =>
  `NGN ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string) => formatRange({ from: d, to: d });

async function render(slips: Payslip[]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(slips.length === 1 ? `Payslip ${slips[0].number}` : `Payslips ${slips[0].period}`);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const slip of slips) drawPayslip(pdf.addPage([595.28, 841.89]), slip, regular, bold);
  return pdf.save();
}

const INK = rgb(0.11, 0.13, 0.12);
const MUTED = rgb(0.42, 0.45, 0.43);
const LINE = rgb(0.86, 0.87, 0.86);
const BRAND = rgb(0.13, 0.42, 0.25);

function drawPayslip(page: PDFPage, s: Payslip, regular: PDFFont, bold: PDFFont) {
  const left = 56;
  const right = 595.28 - 56;
  let y = 841.89 - 64;
  const text = (t: string, x: number, at: number, { font = regular, size = 10, color = INK, align = "left" } = {}) => {
    const clean = ascii(t);
    const width = font.widthOfTextAtSize(clean, size);
    page.drawText(clean, { x: align === "right" ? x - width : x, y: at, size, font, color });
  };
  const rule = (at: number) =>
    page.drawLine({ start: { x: left, y: at }, end: { x: right, y: at }, thickness: 0.75, color: LINE });

  text(s.farm || "Farm", left, y, { font: bold, size: 18 });
  text("PAYSLIP", right, y, { font: bold, size: 18, color: BRAND, align: "right" });
  y -= 18;
  text(monthName(s.period), left, y, { color: MUTED });
  text(s.number, right, y, { color: MUTED, align: "right" });
  y -= 28;
  rule(y);
  y -= 26;

  const facts: [string, string][] = [
    ["Name", s.name],
    ["Job", s.job || PAY_TYPE_LABELS[s.payType]],
    ["Paid", PAY_TYPE_LABELS[s.payType]],
    ["Bank account", s.bank || "Paid in cash"],
  ];
  for (const [label, value] of facts) {
    text(label, left, y, { color: MUTED });
    text(value, left + 120, y, { font: bold });
    y -= 18;
  }
  y -= 14;

  const table = (title: string, rows: [string, number][], total: string) => {
    text(title, left, y, { font: bold, size: 12 });
    text("Amount", right, y, { color: MUTED, align: "right" });
    y -= 10;
    rule(y);
    y -= 18;
    for (const [label, kobo] of rows) {
      text(label, left, y);
      text(naira(kobo), right, y, { align: "right" });
      y -= 18;
    }
    rule(y + 6);
    y -= 10;
    text(total, left, y, { font: bold });
    text(naira(rows.reduce((n, [, k]) => n + k, 0)), right, y, { font: bold, align: "right" });
    y -= 32;
  };
  table(
    "Earnings",
    [[`Pay: ${s.basis}`, s.grossKobo], ...(s.bonusKobo ? ([["Bonus", s.bonusKobo]] as [string, number][]) : [])],
    "Total earnings",
  );
  const deductions: [string, number][] = [
    ...(s.advanceKobo ? ([["Salary advance taken back", s.advanceKobo]] as [string, number][]) : []),
    ...(s.deductionKobo ? ([[s.deductionNote || "Deduction", s.deductionKobo]] as [string, number][]) : []),
  ];
  if (deductions.length) table("Deductions", deductions, "Total deductions");

  page.drawRectangle({ x: left, y: y - 22, width: right - left, height: 52, color: rgb(0.93, 0.96, 0.94) });
  text("Net pay", left + 16, y, { font: bold, size: 13 });
  text(naira(s.netKobo), right - 16, y, { font: bold, size: 16, color: BRAND, align: "right" });
  y -= 52;
  text(
    s.paidOn
      ? `Paid on ${day(s.paidOn)} by ${METHODS[s.method] ?? s.method}.`
      : s.netKobo
        ? "Not paid yet."
        : "Nothing to pay this month.",
    left,
    y,
    { color: MUTED },
  );

  text(`${s.farm} · Payslip ${s.number}`, left, 48, { size: 8, color: MUTED });
}
