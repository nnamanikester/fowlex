import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { daysIn, periodEnd, settle, totals, validateAdjustment } from "./rules";
import {
  adjustLine,
  approveRun,
  attendanceLock,
  deleteRun,
  getRun,
  listRuns,
  payRun,
  reopenRun,
  startRun,
} from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { markPaid } from "@/lib/expenses/service";
import { createHouse } from "@/lib/houses/service";
import { clearBankCache } from "@/lib/paystack/banks";
import * as payouts from "@/lib/payouts/service";
import { configureSimulator, resetSimulator } from "@/lib/paystack/simulator";
import { createAdvance, listAdvances } from "@/lib/people/advances";
import { saveAttendance } from "@/lib/people/attendance";
import { createEmployee, setEmployeeStatus } from "@/lib/people/service";
import { BatchModel } from "@/models/batch";
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
const gtb = { bankCode: "058", accountNumber: "0123456781" };
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const { batch } = await createBatch(
    owner,
    {
      houseId: house.id,
      placedOn: "2026-10-01",
      breed: "Ross 308",
      delivered: 1000,
      pricePerChickKobo: 0,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
    },
    { confirm: true },
    TODAY,
  );
  const add = (over: Record<string, unknown>) => createEmployee(owner, { startDate: "2026-01-05", ...over }, TODAY);
  const bola = await add({ name: "Bola", payType: "monthly", rateKobo: 6_000_000, bank: gtb });
  const kemi = await add({ name: "Kemi", payType: "monthly", rateKobo: 3_000_000, startDate: "2026-11-16" });
  const musa = await add({ name: "Musa", payType: "daily", rateKobo: 400_000, bank: gtb });
  const tunde = await add({
    name: "Tunde",
    payType: "per-batch",
    rateKobo: 15_000_000,
    batchIds: [batch.id],
    bank: gtb,
  });
  await add({ name: "Old hand", payType: "monthly", rateKobo: 1_000_000 }).then((e) =>
    setEmployeeStatus(owner, e.id, { status: "left", leftOn: "2026-10-20" }, TODAY),
  );
  for (const date of ["2026-11-02", "2026-11-03", "2026-11-04"])
    await saveAttendance(
      owner,
      { date, entries: [{ employeeId: musa.id, status: date === "2026-11-04" ? "half" : "present" }] },
      TODAY,
    );
  return { owner, batch, bola, kemi, musa, tunde };
}
const line = <L extends { name: string }>(run: { lines: L[] }, name: string) => run.lines.find((l) => l.name === name)!;

describe("working out a month's pay", () => {
  it("from salaries, attendance, closed batches and advances", async () => {
    const { owner, batch, bola } = await farm();
    await createAdvance(owner, { employeeId: bola.id, amountKobo: 3_000_000, months: 2 }, TODAY);
    const run = await startRun(owner, {}, TODAY);
    expect(run).toMatchObject({ number: "PAY-2026-11", period: "2026-11", status: "draft", payState: "draft" });
    expect(run.lines.map((l) => l.name)).toEqual(["Bola", "Kemi", "Musa", "Tunde"]);
    expect(line(run, "Bola")).toMatchObject({
      basis: "Monthly salary",
      grossKobo: 6_000_000,
      advanceKobo: 1_500_000,
      netKobo: 4_500_000,
      hasBank: true,
    });
    expect(line(run, "Kemi")).toMatchObject({
      basis: "Started 16 Nov: 15 of 30 days",
      grossKobo: 1_500_000,
      hasBank: false,
    });
    expect(line(run, "Musa")).toMatchObject({ units: 2.5, basis: "2½ days × ₦4,000.00", grossKobo: 1_000_000 });
    expect(line(run, "Tunde")).toMatchObject({ basis: "No batch closed this month", grossKobo: 0 });

    // Kept up to date while a draft: the batch closes, Musa works another day.
    await BatchModel.updateOne({ _id: batch.id }, { status: "closed", closedOn: "2026-11-25" });
    await saveAttendance(
      owner,
      { date: "2026-11-05", entries: [{ employeeId: line(run, "Musa").employeeId, status: "present" }] },
      TODAY,
    );
    const now = (await getRun(owner.farmId, run.id))!;
    expect(line(now, "Tunde")).toMatchObject({
      basis: `${batch.code} closed`,
      grossKobo: 15_000_000,
      batchIds: [batch.id],
    });
    expect(line(now, "Musa").grossKobo).toBe(1_400_000);
    expect(now.totals).toMatchObject({ grossKobo: 23_900_000, advanceKobo: 1_500_000, netKobo: 22_400_000, people: 4 });
    expect(await listRuns(owner.farmId)).toHaveLength(1);
    expect(await getRun(owner.farmId, "nope")).toBeNull();
  });

  it("adds bonuses and deductions, and leaves someone out", async () => {
    const { owner, musa, kemi } = await farm();
    const run = await startRun(owner, { period: "2026-11" }, TODAY);
    let next = await adjustLine(
      owner,
      run.id,
      musa.id,
      { bonusKobo: 200_000, deductionKobo: 50_000, deductionNote: " Broken bucket " },
      run.version,
    );
    expect(line(next, "Musa")).toMatchObject({
      employeeId: musa.id,
      bonusKobo: 200_000,
      deductionKobo: 50_000,
      deductionNote: "Broken bucket",
      netKobo: 1_150_000,
    });
    next = await adjustLine(owner, run.id, kemi.id, { excluded: true }, next.version);
    expect(line(next, "Kemi").excluded).toBe(true);
    expect(next.totals.people).toBe(2);
    expect(await refusal(adjustLine(owner, run.id, musa.id, {}, 0))).toMatchObject({ code: "stale" });
    expect(await refusal(adjustLine(owner, run.id, musa.id, { deductionKobo: 100 }, next.version))).toMatchObject({
      field: "deductionNote",
    });
    expect(await refusal(adjustLine(owner, run.id, musa.id, { bonusKobo: -1 }, next.version))).toMatchObject({
      field: "bonusKobo",
    });
    expect(await refusal(adjustLine(owner, run.id, String(oid()), {}, next.version))).toMatchObject({ status: 404 });
    expect(await refusal(adjustLine(owner, String(oid()), musa.id, {}, 0))).toMatchObject({ status: 404 });
  });

  it("refuses a month to come, a month already started, and a bad month", async () => {
    const { owner } = await farm();
    expect(await refusal(startRun(owner, { period: "2026-12" }, TODAY))).toMatchObject({ field: "period" });
    expect(await refusal(startRun(owner, { period: "2026-13" }, TODAY))).toMatchObject({ field: "period" });
    await startRun(owner, { period: "2026-10" }, TODAY);
    expect(await refusal(startRun(owner, { period: "2026-10" }, TODAY))).toMatchObject({ code: "run_exists" });
  });
});

describe("approving and paying", () => {
  it("turns each person's pay into a labour expense, takes back advances, and locks the month", async () => {
    const { owner, bola, musa } = await farm();
    const advance = await createAdvance(owner, { employeeId: bola.id, amountKobo: 1_000_000 }, TODAY);
    const run = await startRun(owner, {}, TODAY);
    expect(await refusal(approveRun(owner, run.id, 9, TODAY))).toMatchObject({ code: "stale" });
    const approved = await approveRun(owner, run.id, run.version, "2026-12-02");
    expect(approved).toMatchObject({ status: "approved", payState: "to-pay" });
    expect(line(approved, "Tunde").expense).toBeNull();
    const bolaPay = await ExpenseModel.findById(line(approved, "Bola").expense!.id).lean();
    expect(bolaPay).toMatchObject({
      category: "labour",
      description: "November 2026 pay: Bola",
      amountKobo: 5_000_000,
      method: "paystack",
      paymentStatus: "unpaid",
      date: "2026-11-30",
    });
    expect(bolaPay?.payeeBank).toMatchObject({ accountName: "CHIOMA EZE" });
    expect((await ExpenseModel.findById(line(approved, "Kemi").expense!.id).lean())?.method).toBe("later");
    expect((await listAdvances(owner.farmId, bola.id))[0]).toMatchObject({ id: advance.id, balanceKobo: 0 });

    // The month is done: attendance and advances for it can't change, and it can't be approved again.
    expect(await attendanceLock(owner.farmId, "2026-11-03")).toMatch(/November 2026's pay is approved/);
    expect(await attendanceLock(owner.farmId, "2026-12-03")).toBeNull();
    expect(await refusal(createAdvance(owner, { employeeId: bola.id, amountKobo: 100_000 }, TODAY))).toMatchObject({
      code: "pay_approved",
    });
    expect(await refusal(approveRun(owner, run.id, approved.version, TODAY))).toMatchObject({ code: "approved" });
    expect(await refusal(adjustLine(owner, run.id, musa.id, {}, approved.version))).toMatchObject({ code: "approved" });
    expect(await refusal(deleteRun(owner, run.id))).toMatchObject({ code: "approved" });
  });

  it("charges a per-batch payslip for one batch to that batch", async () => {
    const { owner, batch } = await farm();
    await BatchModel.updateOne({ _id: batch.id }, { status: "closed", closedOn: "2026-11-20" });
    const run = await startRun(owner, {}, TODAY);
    const approved = await approveRun(owner, run.id, run.version, TODAY);
    expect(String((await ExpenseModel.findById(line(approved, "Tunde").expense!.id).lean())?.batchId)).toBe(batch.id);
  });

  it("pays everyone with a bank account through Paystack; the rest in cash", async () => {
    const { owner } = await farm();
    const run = await startRun(owner, {}, TODAY);
    expect(await refusal(payRun(owner, run.id))).toMatchObject({ code: "draft" });
    const approved = await approveRun(owner, run.id, run.version, TODAY);
    const { run: after, results } = await payRun(owner, run.id);
    expect(results).toEqual([
      { name: "Bola", status: "sent" },
      { name: "Musa", status: "sent" },
    ]);
    expect(line(after, "Bola").expense?.paymentStatus).toBe("paid");
    expect(after.payState).toBe("part-paid");
    expect(await refusal(reopenRun(owner, run.id))).toMatchObject({ code: "run_paid" });
    await markPaid(owner, line(approved, "Kemi").expense!.id, { method: "cash" }, TODAY);
    expect((await getRun(owner.farmId, run.id))!.payState).toBe("paid");
    expect((await payRun(owner, run.id)).results).toEqual([]);
  });

  it("reports transfers waiting for an OTP, and ones Paystack refuses", async () => {
    const { owner } = await farm();
    const run = await startRun(owner, {}, TODAY);
    await approveRun(owner, run.id, run.version, TODAY);
    configureSimulator({ otp: true });
    expect((await payRun(owner, run.id)).results.map((r) => r.status)).toEqual(["otp", "otp"]);
    const other = await startRun(owner, { period: "2026-10" }, TODAY);
    await approveRun(owner, other.id, other.version, TODAY);
    configureSimulator({ otp: false, balance: 0 });
    const { results } = await payRun(owner, other.id);
    expect(results[0]).toMatchObject({ name: "Bola", status: "failed", message: expect.any(String) });
  });

  it("reopens approved pay before anyone's paid, putting back advances and attendance", async () => {
    const { owner, bola } = await farm();
    await createAdvance(owner, { employeeId: bola.id, amountKobo: 1_000_000 }, TODAY);
    const run = await startRun(owner, {}, TODAY);
    const approved = await approveRun(owner, run.id, run.version, TODAY);
    const reopened = await reopenRun(owner, run.id);
    expect(reopened).toMatchObject({ status: "draft", payState: "draft" });
    expect(line(reopened, "Bola").advanceKobo).toBe(1_000_000);
    expect(await ExpenseModel.findById(line(approved, "Bola").expense!.id).lean()).toBeNull();
    expect((await listAdvances(owner.farmId, bola.id))[0].balanceKobo).toBe(1_000_000);
    expect(await attendanceLock(owner.farmId, "2026-11-03")).toBeNull();
    expect(await refusal(reopenRun(owner, run.id))).toMatchObject({ code: "draft" });
    await deleteRun(owner, run.id);
    expect(await listRuns(owner.farmId)).toEqual([]);
  });

  it("pays a share for a month someone left part-way; skips who's left out; reports a transfer that throws", async () => {
    const { owner, bola, kemi } = await farm();
    await setEmployeeStatus(owner, bola.id, { status: "left", leftOn: "2026-11-10" }, TODAY);
    await createAdvance(owner, { employeeId: kemi.id, amountKobo: 100_000 }, TODAY);
    const run = await startRun(owner, {}, TODAY);
    expect(line(run, "Bola")).toMatchObject({ basis: "Left 10 Nov: 10 of 30 days", grossKobo: 2_000_000 });
    const out = await adjustLine(owner, run.id, kemi.id, { excluded: true }, run.version);
    const approved = await approveRun(owner, run.id, out.version, TODAY);
    expect(line(approved, "Kemi").expense).toBeNull();
    expect((await listAdvances(owner.farmId, kemi.id))[0].balanceKobo).toBe(100_000);
    vi.spyOn(payouts, "payExpense").mockRejectedValueOnce(new Error("Paystack is busy."));
    expect((await payRun(owner, run.id)).results[0]).toEqual({
      name: "Bola",
      status: "failed",
      message: "Paystack is busy.",
    });
    expect(await refusal(reopenRun(owner, "nope"))).toMatchObject({ status: 404 });
  });

  it("has nothing to approve with no pay", async () => {
    const owner: CurrentUser = {
      id: String(oid()),
      farmId: String(oid()),
      name: "Ada",
      email: "a@f.com",
      role: "owner",
    };
    await createEmployee(owner, { name: "Musa", payType: "daily", rateKobo: 400_000 }, TODAY);
    const run = await startRun(owner, {}, TODAY);
    expect(await refusal(approveRun(owner, run.id, run.version, TODAY))).toMatchObject({ code: "nothing_to_pay" });
  });
});

describe("pay rules", () => {
  it("never takes pay below nothing, and adds up only who's paid", () => {
    const none = { bonusKobo: 0, deductionKobo: 0, deductionNote: "", excluded: false };
    expect(
      settle(500_000, none, [
        { advanceId: "a", amountKobo: 300_000 },
        { advanceId: "b", amountKobo: 300_000 },
      ]),
    ).toEqual({
      advances: [
        { advanceId: "a", amountKobo: 300_000 },
        { advanceId: "b", amountKobo: 200_000 },
      ],
      advanceKobo: 500_000,
      netKobo: 0,
    });
    expect(settle(100_000, { ...none, deductionKobo: 200_000 }, []).netKobo).toBe(0);
    const l = { grossKobo: 10, bonusKobo: 1, deductionKobo: 2, advanceKobo: 3, netKobo: 6 };
    expect(
      totals([
        { ...l, excluded: false },
        { ...l, excluded: true },
      ]),
    ).toEqual({ grossKobo: 10, bonusKobo: 1, deductionKobo: 2, advanceKobo: 3, netKobo: 6, people: 1 });
    expect(validateAdjustment({})).toMatchObject({
      bonusKobo: expect.any(String),
      deductionNote: expect.any(String),
      excluded: expect.any(String),
    });
    expect([daysIn("2026-02"), daysIn("2028-02"), periodEnd("2026-11")]).toEqual([28, 29, "2026-11-30"]);
  });
});
