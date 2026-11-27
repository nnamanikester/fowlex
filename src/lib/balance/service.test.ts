import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addTestMoney,
  balanceSummary,
  listEntries,
  recordTransferSent,
  recordTransferUndone,
  saveTopUp,
  syncAllBalances,
  syncBalance,
} from "./service";
import { createExpense } from "@/lib/expenses/service";
import * as email from "@/lib/email";
import { outbox } from "@/lib/email";
import * as transfers from "@/lib/paystack/transfers";
import { clearBankCache } from "@/lib/paystack/banks";
import { configureSimulator, resetSimulator, simulate, simulateLedger } from "@/lib/paystack/simulator";
import { payExpense, settle, submitOtp } from "@/lib/payouts/service";
import { BalanceEntryModel } from "@/models/balance-entry";
import { PayoutModel } from "@/models/payout";
import { UserModel } from "@/models/user";
import { setupTestDb } from "@/test/db";
import { moneyFarm, TODAY } from "@/test/money";

setupTestDb();
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "");
  vi.stubEnv("PAYSTACK_SIMULATE", "1");
  clearBankCache();
  resetSimulator();
  outbox().length = 0;
});
afterEach(() => vi.unstubAllEnvs());

const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

/** A farm with a real owner (so entries name who sent them) and its book open at ₦10,000,000. */
async function farm({ open = true } = {}) {
  const f = await moneyFarm();
  await UserModel.create({
    _id: f.owner.id,
    farmId: f.owner.farmId,
    email: `ada-${f.owner.id}@fowlex.com`,
    name: "Ada Owner",
    role: "owner",
  });
  if (open) await syncBalance(f.owner.farmId);
  const pay = async (supplierId = f.mill.id) => {
    const { expense } = await createExpense(f.owner, f.purchase({ method: "paystack", supplierId }), {}, TODAY);
    await payExpense(f.owner, expense.id);
    return expense;
  };
  return { ...f, pay };
}

describe("the Paystack balance book", () => {
  it("opens at Paystack's balance, once, and matches it", async () => {
    const { owner } = await farm();
    expect(await syncBalance(owner.farmId)).toEqual({ opened: false, added: 0, fundedKobo: [] });
    const [opening] = await listEntries(owner.farmId);
    expect(opening).toMatchObject({
      category: "opening",
      direction: "credit",
      amountKobo: 1_000_000_000,
      balanceAfterKobo: 1_000_000_000,
      confirmed: true,
    });
    expect(await balanceSummary(owner.farmId)).toMatchObject({
      mode: "simulated",
      opened: true,
      paystackKobo: 1_000_000_000,
      fowlexKobo: 1_000_000_000,
      differenceKobo: 0,
      pending: 0,
    });
  });

  it("books a transfer and its fee the moment Paystack takes it, then confirms them from the ledger", async () => {
    const { owner, pay } = await farm();
    const expense = await pay();
    const [fee, transfer] = await listEntries(owner.farmId);
    expect(transfer).toMatchObject({
      category: "transfer",
      direction: "debit",
      amountKobo: 36_000_000,
      confirmed: false,
      channel: "fowlex",
      initiatedBy: "Ada Owner",
      counterparty: { name: "CHIOMA EZE", bankName: "Guaranty Trust Bank", accountNumber: "0123456781" },
      expenseId: expense.id,
      description: `To CHIOMA EZE: ${expense.number}`,
    });
    expect(transfer.paystack.reference).toMatch(/^fwx-exp-/);
    expect(fee).toMatchObject({ category: "transfer_fee", amountKobo: 5_000, confirmed: false });
    expect((await balanceSummary(owner.farmId)).pending).toBe(2);

    expect(await syncBalance(owner.farmId)).toMatchObject({ added: 0 });
    const after = await listEntries(owner.farmId);
    expect(after.slice(0, 2).every((e) => e.confirmed && e.paystack.ledgerId)).toBe(true);
    expect(after[0].balanceAfterKobo).toBe(1_000_000_000 - 36_000_000 - 5_000);
    expect(after[1].paystack.transferId).toBe("1");
    expect(await balanceSummary(owner.farmId)).toMatchObject({ differenceKobo: 0, pending: 0 });
  });

  it("a transfer the bank refuses nets to nothing, with each leg on the record", async () => {
    const { owner, pay, failing } = await farm();
    await pay(failing.id);
    expect(await listEntries(owner.farmId)).toHaveLength(1); // Fowlex's own guess came off
    await syncBalance(owner.farmId);
    const entries = await listEntries(owner.farmId);
    expect(entries.map((e) => [e.category, e.direction, e.amountKobo])).toEqual([
      ["transfer_reversal", "credit", 36_005_000],
      ["transfer_fee", "debit", 5_000],
      ["transfer", "debit", 36_000_000],
      ["opening", "credit", 1_000_000_000],
    ]);
    expect(entries.slice(0, 3).every((e) => e.channel === "fowlex" && e.initiatedBy === "Ada Owner")).toBe(true);
    expect(await balanceSummary(owner.farmId)).toMatchObject({ fowlexKobo: 1_000_000_000, differenceKobo: 0 });
  });

  it("waits for the OTP before booking, and books a transfer the bank later returns", async () => {
    const { owner, mill, purchase } = await farm();
    configureSimulator({ otp: true });
    const { expense } = await createExpense(owner, purchase({ method: "paystack", supplierId: mill.id }), {}, TODAY);
    const held = await payExpense(owner, expense.id);
    expect(await listEntries(owner.farmId)).toHaveLength(1);
    await submitOtp(owner, held.id, "123456");
    expect((await listEntries(owner.farmId)).map((e) => e.category)).toEqual(["transfer_fee", "transfer", "opening"]);

    await settle(held.reference, "reversed", { failure: "Returned" });
    const [back] = await listEntries(owner.farmId);
    expect(back).toMatchObject({
      category: "transfer_reversal",
      direction: "credit",
      amountKobo: 36_000_000,
      confirmed: false,
    });
    // Recording it again changes nothing.
    await recordTransferUndone(held.reference, "reversed");
    expect(await listEntries(owner.farmId)).toHaveLength(4);
  });

  it("finds Fowlex's transfer by the expense number when Paystack's transfer id isn't known", async () => {
    const { owner, pay } = await farm();
    const expense = await pay();
    await PayoutModel.updateMany({}, { $set: { transferId: null } });
    await syncBalance(owner.farmId);
    const entries = await listEntries(owner.farmId);
    expect(entries.filter((e) => e.expenseId === expense.id && e.confirmed)).toHaveLength(2);
    expect((await PayoutModel.findOne().lean())?.transferId).toBe("1");
  });

  it("books test money as funding, says so to the owners, and still matches", async () => {
    const { owner } = await farm();
    expect(await addTestMoney(owner, 5_000_000)).toMatchObject({ added: 1, fundedKobo: [5_000_000] });
    const [funding] = await listEntries(owner.farmId);
    expect(funding).toMatchObject({
      category: "funding",
      direction: "credit",
      channel: "simulator",
      description: "Balance top-up",
      balanceAfterKobo: 1_005_000_000,
    });
    expect(outbox().at(-1)).toMatchObject({
      to: `ada-${owner.id}@fowlex.com`,
      subject: "Paystack balance funded: ₦50,000.00",
    });
    expect(await balanceSummary(owner.farmId)).toMatchObject({ differenceKobo: 0 });
    expect(await refusal(addTestMoney(owner, 0))).toMatchObject({ code: "invalid_amount", field: "amountKobo" });
  });

  it("books what happened in the Paystack Dashboard, so the book still matches", async () => {
    const { owner } = await farm();
    simulate("POST", "/transferrecipient", {}, { bank_code: "058", account_number: "0123456789" });
    simulate("POST", "/transfer", {}, { amount: 1_000_000, recipient: "RCP_sim0580123456789", reference: "dash-1" });
    simulateLedger(250_000, "Customer payment", "Transaction");
    simulateLedger(-100_000, "Refund to customer", "Refund");
    simulateLedger(-5_000, "Identity verification charge", "Charge Service");
    simulateLedger(-1_000, "Something new", "Mystery");
    simulateLedger(2_000, "Adjustment", "Mystery");
    await syncBalance(owner.farmId);
    const entries = await listEntries(owner.farmId);
    expect(entries.map((e) => [e.category, e.channel])).toEqual([
      ["other", "paystack"],
      ["other", "paystack"],
      ["service_charge", "paystack"],
      ["refund", "paystack"],
      ["collection", "paystack"],
      ["transfer_fee", "paystack"],
      ["transfer", "paystack"],
      ["opening", "paystack"],
    ]);
    expect(await balanceSummary(owner.farmId)).toMatchObject({ differenceKobo: 0 });
    // Read twice, booked once.
    expect(await syncBalance(owner.farmId)).toMatchObject({ added: 0 });
  });

  it("leaves a payment made before the book opened to the opening balance", async () => {
    const { owner, pay } = await farm({ open: false });
    await pay();
    expect(await listEntries(owner.farmId)).toEqual([]);
    await syncBalance(owner.farmId);
    expect((await listEntries(owner.farmId)).map((e) => e.category)).toEqual(["opening"]);
    expect(await balanceSummary(owner.farmId)).toMatchObject({ differenceKobo: 0 });
    // A payout Fowlex doesn't know is ignored.
    await recordTransferSent("nope");
    await recordTransferUndone("nope", "failed");
  });

  it("keeps the top-up account the Dashboard shows, checked", async () => {
    const { owner } = await farm();
    expect(await refusal(saveTopUp(owner, { bankName: "Wema", accountNumber: "123", accountName: "x" }))).toMatchObject(
      {
        code: "invalid",
        field: "accountNumber",
      },
    );
    expect(
      await saveTopUp(owner, {
        bankName: " Wema Bank ",
        accountNumber: "012 345 6789",
        accountName: "Paystack-Fowlex",
      }),
    ).toEqual({ bankName: "Wema Bank", accountNumber: "0123456789", accountName: "Paystack-Fowlex" });
    expect((await balanceSummary(owner.farmId)).topUp?.accountNumber).toBe("0123456789");
  });

  it("refuses test money outside the simulator, and everything without Paystack", async () => {
    const { owner } = await farm();
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_x");
    expect(await refusal(addTestMoney(owner, 1_000))).toMatchObject({ code: "paystack_test" });
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_x");
    expect(await refusal(addTestMoney(owner, 1_000))).toMatchObject({ code: "live" });
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    vi.stubEnv("PAYSTACK_SIMULATE", "");
    expect(await refusal(syncBalance(owner.farmId))).toMatchObject({ code: "paystack_off" });
    expect(await listEntries(owner.farmId)).toEqual([]);
    expect(await balanceSummary(owner.farmId)).toMatchObject({ mode: "off", opened: false, differenceKobo: null });
    expect(await syncAllBalances()).toBe(0);
  });

  it("brings every open book up to date, for the webhook and the daily check", async () => {
    const { owner } = await farm();
    await farm({ open: false });
    simulateLedger(10_000, "Balance top-up", "Topup");
    expect(await syncAllBalances()).toBe(1);
    expect((await listEntries(owner.farmId))[0].category).toBe("funding");
    expect(await BalanceEntryModel.countDocuments()).toBe(2);
  });

  it("guesses Paystack's fee by size until its ledger says, and ignores a ledger note it can't place", async () => {
    const { owner, mill, feed, purchase } = await farm();
    for (const unitCostKobo of [100_000, 1_000_000]) {
      const { expense } = await createExpense(
        owner,
        purchase({ method: "paystack", supplierId: mill.id, lines: [{ itemId: feed.id, quantity: 1, unitCostKobo }] }),
        {},
        TODAY,
      );
      await payExpense(owner, expense.id);
    }
    const fees = (await listEntries(owner.farmId))
      .filter((e) => e.category === "transfer_fee")
      .map((e) => e.amountKobo);
    expect(fees.sort()).toEqual([1_000, 2_500]);
    simulateLedger(-500, "Fowlex EXP-2026-9999 to nobody", "Transfer");
    await syncBalance(owner.farmId);
    expect((await listEntries(owner.farmId))[0]).toMatchObject({ category: "transfer", channel: "paystack" });
  });

  it("never stands in the way of a payment, and keeps going past one farm's trouble", async () => {
    const { owner } = await farm();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(PayoutModel, "findOne").mockImplementationOnce(() => {
      throw new Error("db down");
    });
    await recordTransferSent("x");
    vi.spyOn(PayoutModel, "findOne").mockImplementationOnce(() => {
      throw new Error("db down");
    });
    await recordTransferUndone("x", "reversed");
    expect(error).toHaveBeenCalledWith("[balance] recording a transfer", expect.any(Error));
    expect(error).toHaveBeenCalledWith("[balance] recording a returned transfer", expect.any(Error));

    vi.spyOn(email, "sendEmail").mockRejectedValueOnce(new Error("mail down"));
    simulateLedger(10_000, "Balance top-up", "Topup");
    expect((await syncBalance(owner.farmId)).fundedKobo).toEqual([10_000]);
    expect(error).toHaveBeenCalledWith("[balance] funding email", expect.any(Error));

    vi.spyOn(transfers, "getBalance").mockRejectedValueOnce(new Error("Paystack down"));
    expect(await syncAllBalances()).toBe(0);
    expect(error).toHaveBeenCalledWith("[balance] sync", owner.farmId, expect.any(Error));

    // Off, nothing is booked at all; a returned transfer before the book opens waits for the opening.
    vi.stubEnv("PAYSTACK_SIMULATE", "");
    await recordTransferSent("x");
    await recordTransferUndone("x", "failed");
    vi.stubEnv("PAYSTACK_SIMULATE", "1");
    const closed = await farm({ open: false });
    const expense = await closed.pay();
    const payout = await PayoutModel.findOne({ expenseId: expense.id }).lean();
    await recordTransferUndone(payout!.reference, "reversed");
    expect(await listEntries(closed.owner.farmId)).toEqual([]);
  });
});
