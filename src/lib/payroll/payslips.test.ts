import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emailPayslip, listPayslips, payslipPdf, resendPayslip } from "./payslips";
import { adjustLine, approveRun, payRun, startRun } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { outbox } from "@/lib/email";
import * as email from "@/lib/email";
import { markPaid } from "@/lib/expenses/service";
import { clearBankCache } from "@/lib/paystack/banks";
import { resetSimulator } from "@/lib/paystack/simulator";
import { createAdvance } from "@/lib/people/advances";
import { createEmployee } from "@/lib/people/service";
import { FarmModel } from "@/models/farm";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "");
  vi.stubEnv("PAYSTACK_SIMULATE", "1");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  clearBankCache();
  resetSimulator();
  outbox().length = 0;
});
afterEach(() => vi.unstubAllEnvs());

const TODAY = "2026-11-27";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string }) => ({ status: e.status, code: e.code }),
  );

async function approved() {
  const farm = await FarmModel.create({ name: "Green Acres Farm" });
  const owner: CurrentUser = {
    id: String(oid()),
    farmId: String(farm._id),
    name: "Ada",
    email: "a@f.com",
    role: "owner",
  };
  const bola = await createEmployee(
    owner,
    {
      name: "Bọ́lá Adé",
      email: "bola@f.com",
      payType: "monthly",
      rateKobo: 6_000_000,
      startDate: "2026-01-05",
      bank: { bankCode: "058", accountNumber: "0123456781" },
    },
    TODAY,
  );
  const musa = await createEmployee(
    owner,
    { name: "Musa", job: "Cleaner", payType: "monthly", rateKobo: 3_000_000, startDate: "2026-01-05" },
    TODAY,
  );
  const kemi = await createEmployee(
    owner,
    { name: "Kemi", email: "kemi@f.com", payType: "monthly", rateKobo: 2_000_000, startDate: "2026-01-05" },
    TODAY,
  );
  await createAdvance(owner, { employeeId: bola.id, amountKobo: 1_000_000 }, TODAY);
  let run = await startRun(owner, {}, TODAY);
  run = await adjustLine(
    owner,
    run.id,
    bola.id,
    { bonusKobo: 500_000, deductionKobo: 100_000, deductionNote: "Broken feeder" },
    run.version,
  );
  run = await approveRun(owner, run.id, run.version, TODAY);
  const lineOf = (id: string) => run.lines.find((l) => l.employeeId === id)!;
  return { owner, run, bola, musa, kemi, lineOf };
}

describe("payslips", () => {
  it("makes a PDF of a month's payslips, one page each, or of one person's", async () => {
    const { owner, run, bola, lineOf } = await approved();
    const all = await payslipPdf(owner.farmId, run.id);
    expect(all.filename).toBe("Payslips 2026-11.pdf");
    expect(Buffer.from(all.bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(all.bytes)).getPageCount()).toBe(3);
    const one = await payslipPdf(owner.farmId, run.id, lineOf(bola.id).id);
    expect(one.filename).toBe("Payslip 2026-11 Bola Ade.pdf");
    expect((await PDFDocument.load(one.bytes)).getPageCount()).toBe(1);
    expect(await refusal(payslipPdf(owner.farmId, "nope"))).toMatchObject({ status: 404 });
    expect(await refusal(payslipPdf(owner.farmId, run.id, "nope"))).toMatchObject({ status: 404 });
    expect(await refusal(payslipPdf(owner.farmId, String(oid())))).toMatchObject({ status: 404 });
  });

  it("lists someone's payslips with what's on them", async () => {
    const { owner, bola } = await approved();
    expect(await listPayslips(owner.farmId, bola.id)).toMatchObject([
      {
        number: "PAY-2026-11-01",
        farm: "Green Acres Farm",
        grossKobo: 6_000_000,
        bonusKobo: 500_000,
        advanceKobo: 1_000_000,
        deductionKobo: 100_000,
        deductionNote: "Broken feeder",
        netKobo: 5_400_000,
        bank: "Guaranty Trust Bank ••••6781",
        paymentStatus: "unpaid",
        paidOn: null,
      },
    ]);
    expect(await listPayslips(owner.farmId, "nope")).toEqual([]);
  });

  it("emails a payslip once its pay lands through Paystack, and once paid in cash", async () => {
    const { owner, run, kemi, musa, lineOf } = await approved();
    await payRun(owner, run.id);
    expect(outbox()).toMatchObject([
      {
        to: "bola@f.com",
        subject: "Your payslip for November 2026",
        attachments: [{ filename: "Payslip 2026-11.pdf" }],
      },
    ]);
    expect(outbox()[0].text).toContain("Your pay for November 2026, NGN 54,000.00, was paid on");
    // Paid in cash: Kemi gets hers; Musa has no email.
    await markPaid(owner, lineOf(kemi.id).expense!.id, { method: "cash" }, TODAY);
    await markPaid(owner, lineOf(musa.id).expense!.id, { method: "cash" }, TODAY);
    expect(outbox().map((m) => m.to)).toEqual(["bola@f.com", "kemi@f.com"]);
    expect((await listPayslips(owner.farmId, kemi.id))[0]).toMatchObject({
      paidOn: TODAY,
      method: "cash",
      emailedAt: expect.any(String),
    });
    // Not twice, and only for payslips that are paid.
    expect(await emailPayslip(lineOf(kemi.id).expense!.id)).toBe(false);
    expect(await emailPayslip(String(oid()))).toBe(false);
  });

  it("sends one again on request, and says why it can't", async () => {
    const { owner, run, bola, musa, lineOf } = await approved();
    expect(await resendPayslip(owner.farmId, run.id, lineOf(bola.id).id)).toEqual({ to: "bola@f.com" });
    expect(outbox()[0].text).toContain("Your pay for November 2026 is NGN 54,000.00.");
    expect(await refusal(resendPayslip(owner.farmId, run.id, lineOf(musa.id).id))).toMatchObject({ code: "no_email" });
    expect(await refusal(resendPayslip(owner.farmId, run.id, "nope"))).toMatchObject({ status: 404 });
  });

  it("gives a payslip to someone whose advance took all their pay, with nothing to send", async () => {
    const farm = await FarmModel.create({ name: "Small Farm" });
    const owner: CurrentUser = {
      id: String(oid()),
      farmId: String(farm._id),
      name: "Ada",
      email: "a@f.com",
      role: "owner",
    };
    const ngozi = await createEmployee(
      owner,
      { name: "Ngozi", email: "n@f.com", payType: "monthly", rateKobo: 1_000_000, startDate: "2026-01-05" },
      TODAY,
    );
    await createAdvance(owner, { employeeId: ngozi.id, amountKobo: 1_500_000 }, TODAY);
    let run = await startRun(owner, {}, TODAY);
    run = await adjustLine(owner, run.id, ngozi.id, { deductionKobo: 0, deductionNote: "" }, run.version);
    run = await approveRun(owner, run.id, run.version, TODAY);
    const [slip] = await listPayslips(owner.farmId, ngozi.id);
    expect(slip).toMatchObject({ netKobo: 0, advanceKobo: 1_000_000, paymentStatus: "paid", paidOn: null, method: "" });
    expect((await PDFDocument.load((await payslipPdf(owner.farmId, run.id)).bytes)).getPageCount()).toBe(1);
    expect(await refusal(resendPayslip(owner.farmId, run.id, slip.lineId))).toMatchObject({ code: "no_pay" });
  });

  it("waits for the pay before emailing", async () => {
    const { lineOf, kemi } = await approved();
    expect(await emailPayslip(lineOf(kemi.id).expense!.id)).toBe(false);
    expect(outbox()).toEqual([]);
  });

  it("never lets a failed email stop the payment", async () => {
    const { owner, kemi, lineOf } = await approved();
    vi.spyOn(email, "sendEmail").mockRejectedValueOnce(new Error("Resend is down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await markPaid(owner, lineOf(kemi.id).expense!.id, { method: "cash" }, TODAY)).paymentStatus).toBe("paid");
    expect(error).toHaveBeenCalledWith("[payslip email]", expect.any(Error));
  });
});
