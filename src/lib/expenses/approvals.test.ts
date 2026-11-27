import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { approveExpense, createExpense, markPaid, pendingApprovals, rejectExpense, supplierBalances } from "./service";
import { outbox } from "@/lib/email";
import { stockLevels } from "@/lib/inventory/movements";
import { clearBankCache } from "@/lib/paystack/banks";
import { resetSimulator } from "@/lib/paystack/simulator";
import { payExpense } from "@/lib/payouts/service";
import { readSettings, updateSettings } from "@/lib/settings/service";
import { UserModel } from "@/models/user";
import { setupTestDb } from "@/test/db";
import { moneyFarm, TODAY } from "@/test/money";

setupTestDb();
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "");
  vi.stubEnv("PAYSTACK_SIMULATE", "1");
  clearBankCache();
  resetSimulator();
  outbox().splice(0);
});
afterEach(() => vi.unstubAllEnvs());

const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );
const spend = (amountKobo: number, over: Record<string, unknown> = {}) => ({
  category: "repairs",
  amountKobo,
  description: "Fix the borehole pump",
  method: "later",
  ...over,
});

describe("approvals", () => {
  it("makes a manager's ₦250,000 expense wait for approval; it doesn't count until an owner approves it", async () => {
    const { owner, manager, mill } = await moneyFarm();
    await UserModel.create({ farmId: owner.farmId, email: "ada@fowlex.com", name: "Ada", role: "owner" });
    const { expense } = await createExpense(manager, spend(25_000_000, { supplierId: mill.id }), {}, TODAY);
    expect(expense).toMatchObject({ approval: "pending", paymentStatus: "unpaid" });
    expect(await pendingApprovals(owner.farmId)).toBe(1);
    expect(outbox()).toMatchObject([
      { to: "ada@fowlex.com", subject: expect.stringContaining("₦250,000.00: approve it?") },
    ]);
    // Owed to the supplier (the work was done), but it can't be sent through Paystack yet.
    expect((await supplierBalances(owner.farmId)).get(mill.id)?.owedKobo).toBe(25_000_000);
    expect(await refusal(payExpense(owner, expense.id))).toMatchObject({ code: "not_approved" });

    const approved = await approveExpense(owner, expense.id);
    expect(approved).toMatchObject({ approval: "approved", approvalNote: "" });
    expect(await pendingApprovals(owner.farmId)).toBe(0);
    expect((await payExpense(owner, expense.id)).status).toBe("success");
    expect(await refusal(approveExpense(owner, expense.id))).toMatchObject({ code: "not_pending" });
  });

  it("doesn't hold up owners, spending at or under the limit, or a lower limit set in settings", async () => {
    const { owner, manager } = await moneyFarm();
    expect((await createExpense(owner, spend(25_000_000), {}, TODAY)).expense.approval).toBe("approved");
    expect((await createExpense(manager, spend(10_000_000), {}, TODAY)).expense.approval).toBe("approved");
    await updateSettings(owner, { ...(await readSettings(owner.farmId)), expenseApprovalLimitKobo: 500_000 });
    expect((await createExpense(manager, spend(500_001), {}, TODAY)).expense.approval).toBe("pending");
  });

  it("rejects with a reason: not counted, not owed, can't be paid, and its stock comes off", async () => {
    const { owner, manager, mill, feed, purchase } = await moneyFarm();
    const { expense } = await createExpense(manager, purchase({ method: "later" }), {}, TODAY);
    expect(expense.approval).toBe("pending");
    expect((await stockLevels(owner.farmId)).get(feed.id)?.onHand).toBe(20);
    expect(await refusal(rejectExpense(owner, expense.id, "  "))).toMatchObject({ field: "reason" });
    expect(await refusal(rejectExpense(owner, expense.id, "x".repeat(301)))).toMatchObject({ field: "reason" });
    const rejected = await rejectExpense(owner, expense.id, "The price was ₦17,000 a bag.");
    expect(rejected).toMatchObject({ approval: "rejected", approvalNote: "The price was ₦17,000 a bag." });
    expect((await stockLevels(owner.farmId)).get(feed.id)).toBeUndefined();
    expect((await supplierBalances(owner.farmId)).get(mill.id)).toBeUndefined();
    expect(await refusal(payExpense(owner, expense.id))).toMatchObject({ code: "rejected" });
    expect(await refusal(markPaid(owner, expense.id, { method: "cash" }, TODAY))).toMatchObject({ code: "rejected" });
    expect(await refusal(rejectExpense(owner, expense.id, "again"))).toMatchObject({ code: "not_pending" });
  });

  it("still lets cash already paid be recorded while it waits", async () => {
    const { owner, manager } = await moneyFarm();
    const { expense } = await createExpense(manager, spend(25_000_000, { method: "cash" }), {}, TODAY);
    expect(expense).toMatchObject({ approval: "pending", paymentStatus: "paid" });
    const owed = (await createExpense(manager, spend(25_000_000), {}, TODAY)).expense;
    expect((await markPaid(manager, owed.id, { method: "pos" }, TODAY)).paymentStatus).toBe("paid");
    expect(await pendingApprovals(owner.farmId)).toBe(2);
  });
});
