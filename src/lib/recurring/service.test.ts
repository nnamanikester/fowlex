import { afterEach, describe, expect, it, vi } from "vitest";

import { listRecurring, runRecurring, updateRecurring } from "./service";
import { GET as cron } from "@/app/api/cron/recurring/route";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createExpense, listExpenses } from "@/lib/expenses/service";
import { ExpenseModel } from "@/models/expense";
import { RecurringExpenseModel } from "@/models/recurring-expense";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
afterEach(() => vi.unstubAllEnvs());

const owner = (): CurrentUser => ({
  id: String(oid()),
  farmId: String(oid()),
  name: "Ada",
  email: "a@f.com",
  role: "owner",
});
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );
const rent = (date: string) => ({
  category: "rent",
  amountKobo: 15_000_000,
  description: "Pen rent",
  payeeName: "Landlord",
  method: "transfer",
  date,
  repeat: true,
});

describe("monthly repeats", () => {
  it("makes a rent recorded on 1 Dec again on 1 Jan, waiting for approval, and only once", async () => {
    const a = owner();
    const { expense } = await createExpense(a, rent("2026-12-01"), {}, "2026-12-01");
    const [repeat] = await listRecurring(a.farmId);
    expect(repeat).toMatchObject({
      description: "Pen rent",
      amountKobo: 15_000_000,
      dayOfMonth: 1,
      nextDue: "2027-01-01",
      active: true,
    });
    expect(await ExpenseModel.findById(expense.id).lean()).toMatchObject({ period: "2026-12" });

    expect(await runRecurring("2026-12-31")).toBe(0);
    expect(await runRecurring("2027-01-01")).toBe(1);
    expect(await runRecurring("2027-01-01")).toBe(0);
    const january = (await listExpenses(a.farmId)).find((e) => e.date === "2027-01-01");
    expect(january).toMatchObject({
      description: "Pen rent",
      amountKobo: 15_000_000,
      payeeName: "Landlord",
      category: "rent",
      approval: "pending",
      paymentStatus: "unpaid",
      method: "later",
      number: "EXP-2027-0001",
    });
    expect((await listRecurring(a.farmId))[0].nextDue).toBe("2027-02-01");
  });

  it("catches up on months it missed, and never makes a month twice", async () => {
    const a = owner();
    await createExpense(a, rent("2026-12-31"), {}, "2026-12-31");
    expect(await runRecurring("2027-04-02")).toBe(3);
    expect((await listExpenses(a.farmId)).map((e) => e.date).sort()).toEqual([
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
    // Another server ran the same job a moment earlier: the month is already there.
    await RecurringExpenseModel.updateMany({}, { nextDue: "2027-03-31" });
    expect(await runRecurring("2027-04-02")).toBe(0);
  });

  it("changes amount and day, stops and restarts, and refuses nonsense", async () => {
    const a = owner();
    await createExpense(a, rent("2026-12-01"), {}, "2026-12-01");
    const [r] = await listRecurring(a.farmId);
    expect(await updateRecurring(a, r.id, { amountKobo: 16_000_000 }, "2026-12-10")).toMatchObject({
      amountKobo: 16_000_000,
      nextDue: "2027-01-01",
    });
    // A new day: this month's is already made, so from next month.
    expect(await updateRecurring(a, r.id, { dayOfMonth: 28 }, "2026-12-10")).toMatchObject({
      dayOfMonth: 28,
      nextDue: "2027-01-28",
    });
    const stopped = await updateRecurring(a, r.id, { active: false }, "2026-12-10");
    expect(stopped.active).toBe(false);
    expect(await runRecurring("2027-03-01")).toBe(0);
    // Back in March: March's is made (its day still ahead), not the months it was stopped for.
    expect(await updateRecurring(a, r.id, { active: true }, "2027-03-05")).toMatchObject({
      active: true,
      nextDue: "2027-03-28",
    });
    expect(await refusal(updateRecurring(a, r.id, { amountKobo: 0 }))).toMatchObject({ field: "amountKobo" });
    expect(await refusal(updateRecurring(a, r.id, { dayOfMonth: 32 }))).toMatchObject({ field: "dayOfMonth" });
    expect(await refusal(updateRecurring(a, "nope", {}))).toMatchObject({ status: 404 });
    expect(await refusal(updateRecurring(owner(), r.id, {}))).toMatchObject({ status: 404 });
  });

  it("only repeats spending that isn't stock, and only when asked", async () => {
    const a = owner();
    await createExpense(a, { ...rent("2026-12-01"), repeat: false }, {}, "2026-12-01");
    expect(await listRecurring(a.farmId)).toEqual([]);
  });

  it("runs from Vercel's cron with the secret, and surfaces real errors", async () => {
    const call = (auth?: string) =>
      cron(new Request("https://app.fowlex.com/api/cron/recurring", { headers: auth ? { authorization: auth } : {} }));
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect(await (await call("Bearer s3cret")).json()).toEqual({ made: 0 });
    const a = owner();
    await createExpense(a, rent("2026-11-01"), {}, "2026-11-01");
    vi.spyOn(ExpenseModel, "create").mockRejectedValueOnce(new Error("disk full"));
    await expect(runRecurring("2026-12-01")).rejects.toThrow("disk full");
  });
});
