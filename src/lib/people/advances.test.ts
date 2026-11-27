import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { instalment, monthName, nextPeriod, validateAdvance } from "./advance-rules";
import { advanceDeductions, createAdvance, deleteAdvance, listAdvances } from "./advances";
import { createEmployee, setEmployeeStatus } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { deleteExpense } from "@/lib/expenses/service";
import { clearBankCache } from "@/lib/paystack/banks";
import { resetSimulator } from "@/lib/paystack/simulator";
import { payExpense } from "@/lib/payouts/service";
import { AdvanceModel } from "@/models/advance";
import { ExpenseModel } from "@/models/expense";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "");
  vi.stubEnv("PAYSTACK_SIMULATE", "1");
  clearBankCache();
  resetSimulator();
});
afterEach(() => vi.unstubAllEnvs());

const TODAY = "2026-11-27";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const manager: CurrentUser = { ...owner, id: String(oid()), role: "manager" };
  const musa = await createEmployee(
    owner,
    { name: "Musa", payType: "monthly", rateKobo: 6_000_000, bank: { bankCode: "058", accountNumber: "0123456781" } },
    TODAY,
  );
  const ngozi = await createEmployee(owner, { name: "Ngozi", payType: "daily", rateKobo: 400_000 }, TODAY);
  return { owner, manager, musa, ngozi };
}
const expenseOf = (id: string) => ExpenseModel.findOne({ "source.kind": "advance", "source.id": id }).lean();

describe("salary advances", () => {
  it("records an advance given in cash as a paid labour expense, to come out of this month's pay", async () => {
    const { owner, musa } = await farm();
    const a = await createAdvance(
      owner,
      { employeeId: musa.id, amountKobo: 2_000_000, reason: " School fees " },
      TODAY,
    );
    expect(a).toMatchObject({
      date: TODAY,
      months: 1,
      firstPeriod: "2026-11",
      reason: "School fees",
      repaidKobo: 0,
      balanceKobo: 2_000_000,
      expense: { paymentStatus: "paid", method: "cash" },
    });
    expect(await expenseOf(a.id)).toMatchObject({
      category: "labour",
      description: "Salary advance: Musa",
      payeeName: "Musa",
      amountKobo: 2_000_000,
      paidOn: TODAY,
      approval: "approved",
    });
    expect(await listAdvances(owner.farmId, musa.id)).toHaveLength(1);
    expect(await refusal(deleteExpense(owner, a.expense!.id))).toMatchObject({ code: "from_advance" });
  });

  it("sends one through Paystack to their bank account", async () => {
    const { owner, musa, ngozi } = await farm();
    const a = await createAdvance(owner, { employeeId: musa.id, amountKobo: 1_500_000, paidBy: "paystack" }, TODAY);
    expect(a.expense).toMatchObject({ paymentStatus: "unpaid", method: "paystack" });
    expect((await expenseOf(a.id))?.payeeBank).toMatchObject({ accountName: "CHIOMA EZE" });
    expect((await payExpense(owner, a.expense!.id)).status).toBe("success");
    expect(await refusal(deleteAdvance(owner, a.id))).toMatchObject({ code: "advance_paid" });
    expect(
      await refusal(createAdvance(owner, { employeeId: ngozi.id, amountKobo: 100_000, paidBy: "paystack" }, TODAY)),
    ).toMatchObject({ code: "no_bank" });
  });

  it("works out what comes out of each month's pay", async () => {
    const { owner, musa } = await farm();
    const a = await createAdvance(
      owner,
      { employeeId: musa.id, amountKobo: 1_000_000, months: 3, firstPeriod: "2026-12" },
      TODAY,
    );
    await createAdvance(owner, { employeeId: musa.id, amountKobo: 500_000 }, TODAY);
    expect(await advanceDeductions(owner.farmId, musa.id, "2026-11")).toEqual([
      { advanceId: expect.any(String), amountKobo: 500_000 },
    ]);
    const runId = oid();
    // December's run took its share; January's and February's are what's left.
    await AdvanceModel.updateOne(
      { _id: a.id },
      { $push: { repayments: { period: "2026-12", amountKobo: 333_400, runId } } },
    );
    expect(await advanceDeductions(owner.farmId, musa.id, "2026-12", String(runId))).toContainEqual({
      advanceId: a.id,
      amountKobo: 333_400,
    });
    await AdvanceModel.updateOne(
      { _id: a.id },
      { $push: { repayments: { period: "2027-01", amountKobo: 333_400, runId: oid() } } },
    );
    expect(await advanceDeductions(owner.farmId, musa.id, "2027-02")).toContainEqual({
      advanceId: a.id,
      amountKobo: 333_200,
    });
    expect((await listAdvances(owner.farmId, musa.id)).find((x) => x.id === a.id)).toMatchObject({
      repaidKobo: 666_800,
      balanceKobo: 333_200,
    });
    expect(await refusal(deleteAdvance(owner, a.id))).toMatchObject({ code: "advance_repaid" });
  });

  it("waits for an owner when a manager gives a big one; removes one given by mistake", async () => {
    const { owner, manager, musa } = await farm();
    const big = await createAdvance(manager, { employeeId: musa.id, amountKobo: 25_000_000 }, TODAY);
    expect((await expenseOf(big.id))?.approval).toBe("pending");
    await deleteAdvance(owner, big.id);
    expect(await listAdvances(owner.farmId)).toEqual([]);
    expect(await expenseOf(big.id)).toBeNull();
    expect(await refusal(deleteAdvance(owner, big.id))).toMatchObject({ status: 404 });
    expect(await refusal(deleteAdvance(owner, "nope"))).toMatchObject({ status: 404 });
  });

  it("refuses an advance that doesn't add up", async () => {
    const { owner, musa } = await farm();
    const give = (over: Record<string, unknown>) =>
      refusal(createAdvance(owner, { employeeId: musa.id, amountKobo: 100_000, ...over }, TODAY));
    expect(await give({ amountKobo: 0 })).toMatchObject({ field: "amountKobo" });
    expect(await give({ months: 13 })).toMatchObject({ field: "months" });
    expect(await give({ firstPeriod: "2026-10" })).toMatchObject({ field: "firstPeriod" });
    expect(await give({ firstPeriod: "2026-13" })).toMatchObject({ field: "firstPeriod" });
    expect(await give({ date: "2026-12-01" })).toMatchObject({ field: "date" });
    expect(await give({ date: 5 })).toMatchObject({ field: "date" });
    expect(await give({ reason: "x".repeat(201) })).toMatchObject({ field: "reason" });
    expect(await give({ paidBy: "cheque" })).toMatchObject({ field: "paidBy" });
    expect(await give({ employeeId: "x" })).toMatchObject({ field: "employeeId" });
    expect(await give({ employeeId: String(oid()) })).toMatchObject({ field: "employeeId" });
    await setEmployeeStatus(owner, musa.id, { status: "left" }, TODAY);
    expect(await give({})).toMatchObject({ field: "employeeId" });
    expect(validateAdvance({}, { today: TODAY })).toMatchObject({
      employeeId: expect.any(String),
      date: expect.any(String),
      firstPeriod: expect.any(String),
      reason: expect.any(String),
    });
  });

  it("splits, names and steps months", () => {
    expect([instalment(1_000_000, 3), instalment(500_000, 1)]).toEqual([333_400, 500_000]);
    expect([nextPeriod("2026-11"), nextPeriod("2026-12")]).toEqual(["2026-12", "2027-01"]);
    expect(monthName("2026-11")).toBe("November 2026");
  });
});
