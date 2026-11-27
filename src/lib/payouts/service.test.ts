import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  feeFor,
  listPayouts,
  payExpense,
  payPreview,
  settle,
  settlesBySync,
  submitOtp,
  syncPayout,
  refusal as transferRefusal,
} from "./service";
import { createExpense, getExpense, listExpenses, supplierBalances } from "@/lib/expenses/service";
import { today as lagosToday } from "@/lib/dates";
import { HttpError } from "@/lib/auth/guard";
import * as banks from "@/lib/paystack/banks";
import { clearBankCache } from "@/lib/paystack/banks";
import * as client from "@/lib/paystack/client";
import { configureSimulator, resetSimulator } from "@/lib/paystack/simulator";
import * as transfers from "@/lib/paystack/transfers";
import { ExpenseModel } from "@/models/expense";
import { PayoutModel } from "@/models/payout";
import { setupTestDb } from "@/test/db";
import { moneyFarm, TODAY } from "@/test/money";

setupTestDb();
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "");
  vi.stubEnv("PAYSTACK_SIMULATE", "1");
  clearBankCache();
  resetSimulator();
});
afterEach(() => vi.unstubAllEnvs());

const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

async function owed(over: Record<string, unknown> = {}) {
  const f = await moneyFarm();
  const { expense } = await createExpense(f.owner, f.purchase({ method: "paystack", ...over }), {}, TODAY);
  return { ...f, expense };
}

describe("paying a supplier through Paystack", () => {
  it("shows who gets it and whether the balance covers it", async () => {
    const { owner, expense } = await owed();
    expect(await payPreview(owner, expense.id)).toEqual({
      amountKobo: 36_000_000,
      recipient: { accountName: "CHIOMA EZE", bankName: "Guaranty Trust Bank", accountNumber: "••••6781" },
      balanceKobo: 1_000_000_000,
      enough: true,
      feeKobo: 5_000,
    });
    configureSimulator({ balance: 1_000 });
    expect((await payPreview(owner, expense.id)).enough).toBe(false);
  });

  it("sends the money, marks the expense paid, books the fee, and clears what's owed", async () => {
    const { owner, mill, expense } = await owed();
    const payout = await payExpense(owner, expense.id);
    expect(payout).toMatchObject({
      status: "success",
      reference: "fwx-exp-2026-0002-1",
      amountKobo: 36_000_000,
      feeKobo: 5_000,
      recipient: { accountName: "CHIOMA EZE", accountNumber: "••••6781" },
    });
    // Paid the day the transfer landed.
    expect(await getExpense(owner.farmId, expense.id)).toMatchObject({
      paymentStatus: "paid",
      paidOn: lagosToday(),
      method: "paystack",
    });
    const fee = (await listExpenses(owner.farmId)).find((e) => e.category === "bank-charges");
    expect(fee).toMatchObject({ amountKobo: 5_000, automatic: true, paymentStatus: "paid", payeeName: "Paystack" });
    expect(fee?.description).toContain(expense.number);
    expect((await supplierBalances(owner.farmId)).get(mill.id)?.owedKobo).toBe(0);
    expect(await listPayouts(owner.farmId, expense.id)).toHaveLength(1);
    expect(await listPayouts(owner.farmId, "nope")).toEqual([]);
    expect(await refusal(payExpense(owner, expense.id))).toMatchObject({ code: "paid" });
  });

  it("sends one transfer when Pay is tapped twice at once", async () => {
    const { owner, expense } = await owed();
    const results = await Promise.allSettled([payExpense(owner, expense.id), payExpense(owner, expense.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect(await PayoutModel.countDocuments({ expenseId: expense.id })).toBe(1);
  });

  it("leaves a failed transfer owed, with a reason, to retry with a new reference", async () => {
    const { owner, failing, purchase } = await moneyFarm();
    const { expense } = await createExpense(owner, purchase({ method: "paystack", supplierId: failing.id }), {}, TODAY);
    const payout = await payExpense(owner, expense.id);
    expect(payout).toMatchObject({
      status: "failed",
      failure: "The bank didn't accept the transfer. Nothing was sent.",
    });
    expect(await getExpense(owner.farmId, expense.id)).toMatchObject({ paymentStatus: "failed" });
    expect((await supplierBalances(owner.farmId)).get(failing.id)?.owedKobo).toBe(expense.amountKobo);
    expect((await payExpense(owner, expense.id)).reference).toMatch(/-2$/);
    expect((await listExpenses(owner.farmId)).some((e) => e.category === "bank-charges")).toBe(false);
  });

  it("explains a refusal: too little balance", async () => {
    const { owner, expense } = await owed();
    configureSimulator({ balance: 1_000 });
    expect(await payExpense(owner, expense.id)).toMatchObject({
      status: "failed",
      failure: "Your Paystack balance is too low. Top it up, then try again.",
    });
  });

  it("puts a refused key or a blocked server in words an owner can act on", () => {
    expect(transferRefusal("Invalid key")).toMatch(/didn't accept the farm's Paystack key/);
    expect(transferRefusal("Your IP address is not allowed")).toMatch(/blocking Fowlex's server/);
    expect(transferRefusal("")).toBe("Paystack refused the transfer.");
    expect(transferRefusal("Recipient is invalid")).toBe("Recipient is invalid");
  });

  it("waits for an OTP, refuses a wrong one, and sends with the right one", async () => {
    const { owner, expense } = await owed();
    configureSimulator({ otp: true });
    const held = await payExpense(owner, expense.id);
    expect(held.status).toBe("otp");
    expect(await getExpense(owner.farmId, expense.id)).toMatchObject({ paymentStatus: "otp" });
    expect(await refusal(submitOtp(owner, held.id, "12"))).toMatchObject({ field: "otp" });
    expect(await refusal(submitOtp(owner, held.id, "000000"))).toMatchObject({ status: 400, field: "otp" });
    expect(await submitOtp(owner, held.id, "123456")).toMatchObject({ status: "success" });
    expect(await refusal(submitOtp(owner, held.id, "123456"))).toMatchObject({ code: "not_waiting" });
    expect(await refusal(submitOtp(owner, "nope", "123456"))).toMatchObject({ status: 404 });
  });

  it("keeps a transfer pending when Paystack doesn't answer, never sending it again blind", async () => {
    const { owner, expense } = await owed();
    const send = vi.spyOn(transfers, "initiateTransfer").mockRejectedValueOnce(client.unavailable());
    const payout = await payExpense(owner, expense.id);
    expect(payout.status).toBe("pending");
    expect(await getExpense(owner.farmId, expense.id)).toMatchObject({ paymentStatus: "paying" });
    expect(await refusal(payExpense(owner, expense.id))).toMatchObject({ code: "paying" });
    send.mockRestore();
    // Paystack has no record of it yet: it stays pending until it can't still land.
    expect((await syncPayout(payout.reference))?.status).toBe("pending");
    await PayoutModel.collection.updateOne(
      { reference: payout.reference },
      { $set: { createdAt: new Date(Date.now() - 5 * 60_000) } },
    );
    expect((await syncPayout(payout.reference))?.status).toBe("failed");
    expect(await syncPayout("fwx-unknown")).toBeNull();
  });

  it("checks Paystack when it answers with trouble or says the reference was used", async () => {
    const { owner, expense } = await owed();
    vi.spyOn(transfers, "initiateTransfer").mockResolvedValueOnce({
      httpStatus: 502,
      status: false,
      message: "",
      data: null,
    });
    expect((await payExpense(owner, expense.id)).status).toBe("pending");
  });

  it("settles each change once, follows a reversal after success, and ignores repeats", async () => {
    const { owner, expense } = await owed();
    const payout = await payExpense(owner, expense.id);
    await settle(payout.reference, "success", { feeKobo: 5_000 });
    expect((await listExpenses(owner.farmId)).filter((e) => e.category === "bank-charges")).toHaveLength(1);
    await settle(payout.reference, "reversed", { failure: "The bank sent the money back." });
    await settle(payout.reference, "reversed", { failure: "again" });
    expect(await PayoutModel.findById(payout.id).lean()).toMatchObject({
      status: "reversed",
      failure: "The bank sent the money back.",
    });
    expect(await getExpense(owner.farmId, expense.id)).toMatchObject({ paymentStatus: "failed", paidOn: null });
    await settle(payout.reference, "success", { feeKobo: 5_000 });
    expect((await PayoutModel.findById(payout.id).lean())?.status).toBe("reversed");
  });

  it("follows what Paystack says when checked: reversed, failed, or held for an OTP", async () => {
    const { owner, expense } = await owed();
    const verify = vi.spyOn(transfers, "verifyTransfer");
    verify.mockResolvedValueOnce({ status: "otp", transferCode: "TRF_1", transferId: null, feeKobo: 0 });
    vi.spyOn(transfers, "initiateTransfer").mockResolvedValueOnce({
      httpStatus: 200,
      status: true,
      message: "",
      data: { status: "pending" },
    });
    expect((await payExpense(owner, expense.id)).status).toBe("otp");
    verify.mockResolvedValueOnce({ status: "reversed", transferCode: "TRF_1", transferId: null, feeKobo: 0 });
    const ref = (await listPayouts(owner.farmId, expense.id))[0].reference;
    expect((await syncPayout(ref))?.status).toBe("reversed");
  });

  it("refuses to pay what can't be paid", async () => {
    const { owner, cashOnly, purchase } = await moneyFarm();
    const { expense: noBank } = await createExpense(owner, purchase({ supplierId: cashOnly.id }), {}, TODAY);
    expect(await refusal(payExpense(owner, noBank.id))).toMatchObject({ code: "no_bank" });
    const { expense: noSupplier } = await createExpense(
      owner,
      { category: "transport", amountKobo: 100, description: "x", method: "later" },
      {},
      TODAY,
    );
    expect(await refusal(payExpense(owner, noSupplier.id))).toMatchObject({ code: "no_bank" });
    expect(await refusal(payExpense(owner, "nope"))).toMatchObject({ status: 404 });
    await ExpenseModel.updateOne({ _id: noBank.id }, { paymentStatus: "otp" });
    expect(await refusal(payExpense(owner, noBank.id))).toMatchObject({ code: "paying" });
  });

  it("explains Paystack's other refusals, and an OTP refused because Paystack is down", async () => {
    const { owner, expense } = await owed();
    const send = vi.spyOn(transfers, "initiateTransfer");
    send.mockResolvedValueOnce({
      httpStatus: 400,
      status: false,
      message: "OTP is required for this transfer",
      data: null,
    });
    expect((await payExpense(owner, expense.id)).failure).toBe(
      "Paystack wants an OTP for transfers. Try again, then enter the OTP it sends.",
    );
    send.mockResolvedValueOnce({ httpStatus: 400, status: false, message: "", data: null });
    expect((await payExpense(owner, expense.id)).failure).toBe("Paystack refused the transfer.");
    send.mockResolvedValueOnce({
      httpStatus: 400,
      status: false,
      message: "Transfer reference already exists",
      data: null,
    });
    vi.spyOn(transfers, "verifyTransfer").mockResolvedValueOnce({
      status: "abandoned",
      transferCode: null,
      transferId: null,
      feeKobo: 0,
    });
    expect((await payExpense(owner, expense.id)).status).toBe("failed");

    configureSimulator({ otp: true });
    send.mockRestore();
    const held = await payExpense(owner, expense.id);
    vi.spyOn(transfers, "finalizeTransfer").mockResolvedValueOnce({
      httpStatus: 503,
      status: false,
      message: "",
      data: null,
    });
    expect(await refusal(submitOtp(owner, held.id, "123456"))).toMatchObject({ status: 503 });
    vi.spyOn(transfers, "finalizeTransfer").mockResolvedValueOnce({
      httpStatus: 400,
      status: false,
      message: "",
      data: null,
    });
    expect(await refusal(submitOtp(owner, held.id, "123456"))).toMatchObject({ field: "otp" });
  });

  it("books no fee when Paystack charged none", async () => {
    const { owner, expense } = await owed();
    vi.spyOn(transfers, "verifyTransfer").mockResolvedValueOnce({
      status: "success",
      transferCode: "TRF_9",
      transferId: null,
      feeKobo: 0,
    });
    expect((await payExpense(owner, expense.id)).status).toBe("success");
    expect((await listExpenses(owner.farmId)).some((e) => e.category === "bank-charges")).toBe(false);
  });

  it("pays someone who isn't a saved supplier, to the account the bank named", async () => {
    const { owner } = await moneyFarm();
    const { expense } = await createExpense(
      owner,
      {
        category: "transport",
        amountKobo: 1_500_000,
        description: "Haulage from Ibadan",
        method: "paystack",
        payeeBank: { bankCode: "058", accountNumber: "0123456783", accountName: "SOMEONE ELSE" },
      },
      {},
      TODAY,
    );
    expect(expense).toMatchObject({
      supplierId: null,
      payeeName: "NGOZI OKAFOR",
      payeeBank: { accountName: "NGOZI OKAFOR", bankName: "Guaranty Trust Bank", accountNumber: "0123456783" },
    });
    expect(await payPreview(owner, expense.id)).toMatchObject({
      recipient: { accountName: "NGOZI OKAFOR", accountNumber: "••••6783" },
    });
    const payout = await payExpense(owner, expense.id);
    expect(payout).toMatchObject({ status: "success", recipient: { accountName: "NGOZI OKAFOR" } });
    expect(await PayoutModel.findById(payout.id).lean()).toMatchObject({ supplierId: null });
  });

  it("keeps a typed-in account as a supplier when asked, and refuses one the bank can't find", async () => {
    const { owner } = await moneyFarm();
    const spend = (over: Record<string, unknown>) =>
      createExpense(
        owner,
        {
          category: "transport",
          amountKobo: 100_000,
          description: "Haulage",
          method: "later",
          payeeName: "Musa Haulage",
          ...over,
        },
        {},
        TODAY,
      );
    const { expense } = await spend({
      payeeBank: { bankCode: "058", accountNumber: "0123456782" },
      saveSupplier: true,
    });
    expect(expense).toMatchObject({ payeeName: "", payeeBank: null, supplierId: expect.any(String) });
    expect(
      await refusal(spend({ payeeBank: { bankCode: "058", accountNumber: "0123456782" }, saveSupplier: true })),
    ).toMatchObject({
      code: "duplicate_name",
      field: "payeeName",
    });
    expect(await refusal(spend({ payeeBank: { bankCode: "058", accountNumber: "0000000000" } }))).toMatchObject({
      status: 400,
      field: "payeeBank",
    });
    expect(await refusal(spend({ payeeBank: { bankCode: "058", accountNumber: "1111111111" } }))).toMatchObject({
      status: 503,
      field: "payeeBank",
    });
  });

  it("makes the Paystack recipient when paying if Paystack couldn't when saving, or refuses one it won't pay", async () => {
    const { owner } = await moneyFarm();
    const make = vi
      .spyOn(banks, "createRecipient")
      .mockRejectedValueOnce(new HttpError(503, "paystack_unavailable", "busy"));
    const { expense } = await createExpense(
      owner,
      {
        category: "repairs",
        amountKobo: 100_000,
        description: "Welder",
        method: "later",
        payeeBank: { bankCode: "058", accountNumber: "0123456785" },
      },
      {},
      TODAY,
    );
    expect(await ExpenseModel.findById(expense.id).lean()).toMatchObject({ payeeBank: { recipientCode: null } });
    make.mockRestore();
    expect((await payExpense(owner, expense.id)).status).toBe("success");
    expect((await ExpenseModel.findById(expense.id).lean())?.payeeBank?.recipientCode).toMatch(/^RCP_/);
    vi.spyOn(banks, "createRecipient").mockRejectedValueOnce(new HttpError(400, "recipient_refused", "No"));
    expect(
      await refusal(
        createExpense(
          owner,
          {
            category: "repairs",
            amountKobo: 1,
            description: "x",
            method: "later",
            payeeBank: { bankCode: "058", accountNumber: "0123456785" },
          },
          {},
          TODAY,
        ),
      ),
    ).toMatchObject({ field: "payeeBank" });
  });

  it("knows Paystack's fees and when the simulator settles", () => {
    expect([feeFor(500_000), feeFor(500_001), feeFor(5_000_000), feeFor(5_000_001)]).toEqual([
      1_000, 2_500, 2_500, 5_000,
    ]);
    expect(settlesBySync()).toBe(true);
  });
});
