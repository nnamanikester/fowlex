import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  markPaid,
  supplierBalances,
  updateExpense,
} from "./service";
import { stockLevels } from "@/lib/inventory/movements";
import { clearBankCache } from "@/lib/paystack/banks";
import { resetSimulator } from "@/lib/paystack/simulator";
import { BatchModel } from "@/models/batch";
import { ExpenseModel } from "@/models/expense";
import { InventoryItemModel } from "@/models/inventory-item";
import { PayoutModel } from "@/models/payout";
import { StockMovementModel } from "@/models/stock-movement";
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

describe("purchases", () => {
  it("raises stock and records the expense, numbered, with its category and description", async () => {
    const { owner, feed, drug, purchase } = await moneyFarm();
    const { expense, created } = await createExpense(
      owner,
      purchase({
        lines: [
          { itemId: feed.id, quantity: 20, unitCostKobo: 1_800_000 },
          { itemId: drug.id, quantity: 4, unitCostKobo: 150_000 },
        ],
        deliveryKobo: 500_000,
      }),
      {},
      TODAY,
    );
    expect(created).toBe(true);
    expect(expense).toMatchObject({
      number: "EXP-2026-0001",
      category: "feed",
      description: "20 bags Starter feed, 4 sachets Amprolium",
      amountKobo: 36_000_000 + 600_000 + 500_000,
      paymentStatus: "unpaid",
      method: "later",
    });
    expect((await stockLevels(owner.farmId)).get(feed.id)).toMatchObject({ onHand: 20, avgCostKobo: 1_800_000 });
    expect((await createExpense(owner, purchase(), {}, TODAY)).expense.number).toBe("EXP-2026-0002");
  });

  it("saves neither the expense nor the stock if either fails", async () => {
    const { owner, feed, purchase } = await moneyFarm();
    vi.spyOn(StockMovementModel, "create").mockRejectedValueOnce(new Error("disk full"));
    await expect(createExpense(owner, purchase(), {}, TODAY)).rejects.toThrow("disk full");
    expect(await ExpenseModel.countDocuments({ farmId: owner.farmId })).toBe(0);
    expect((await stockLevels(owner.farmId)).get(feed.id)).toBeUndefined();
  });

  it("shows what a supplier is owed after two unpaid purchases, and nothing for one paid in cash", async () => {
    const { owner, mill, purchase } = await moneyFarm();
    await createExpense(owner, purchase(), {}, TODAY);
    await createExpense(
      owner,
      purchase({ lines: [], category: "transport", amountKobo: 250_000, description: "Delivery" }),
      {},
      TODAY,
    );
    await createExpense(owner, purchase({ method: "cash" }), {}, TODAY);
    expect((await supplierBalances(owner.farmId)).get(mill.id)).toEqual({
      owedKobo: 36_250_000,
      sendingKobo: 0,
      count: 3,
    });
    expect(await listExpenses(owner.farmId, { supplierId: mill.id })).toHaveLength(3);
  });

  it("returns the saved expense for a resent request, even twice at once", async () => {
    const { owner, purchase } = await moneyFarm();
    const [a, b] = await Promise.all([
      createExpense(owner, purchase(), { requestId: "spend-0001-abcd" }, TODAY),
      createExpense(owner, purchase(), { requestId: "spend-0001-abcd" }, TODAY),
    ]);
    expect(a.expense.id).toBe(b.expense.id);
    expect(await ExpenseModel.countDocuments({ farmId: owner.farmId })).toBe(1);
    expect(await StockMovementModel.countDocuments({ farmId: owner.farmId })).toBe(1);
  });
});

describe("buying something new", () => {
  const starter = { name: " Layer   mash ", category: "feed", unit: "bag", unitKg: 25 };

  it("makes the item with the purchase, and reuses an item of the same name", async () => {
    const { owner, feed, purchase } = await moneyFarm();
    const { expense } = await createExpense(
      owner,
      purchase({
        lines: [
          { newItem: starter, quantity: 10, unitCostKobo: 1_700_000 },
          { newItem: { ...starter, name: "LAYER MASH" }, quantity: 2, unitCostKobo: 1_700_000 },
          {
            newItem: { name: "starter FEED", category: "feed", unit: "bag", unitKg: 25 },
            quantity: 1,
            unitCostKobo: 1_800_000,
          },
        ],
      }),
      {},
      TODAY,
    );
    const items = await InventoryItemModel.find({ farmId: owner.farmId, nameKey: "layer mash" }).lean();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Layer mash", unitKg: 25, reorderLevel: null });
    expect(expense.lines.map((l) => l.itemId)).toEqual([String(items[0]._id), String(items[0]._id), feed.id]);
    expect(expense.description).toBe("10 bags Layer mash, 2 bags Layer mash, 1 bag Starter feed");
    expect((await stockLevels(owner.farmId)).get(String(items[0]._id))).toMatchObject({ onHand: 12 });
  });

  it("saves nothing when the new item isn't right, or the purchase fails", async () => {
    const { owner, purchase } = await moneyFarm();
    expect(
      await refusal(
        createExpense(
          owner,
          purchase({ lines: [{ newItem: { ...starter, unitKg: null }, quantity: 1, unitCostKobo: 1 }] }),
          {},
          TODAY,
        ),
      ),
    ).toMatchObject({ field: "lines.0" });
    vi.spyOn(StockMovementModel, "create").mockRejectedValueOnce(new Error("disk full"));
    await expect(
      createExpense(owner, purchase({ lines: [{ newItem: starter, quantity: 1, unitCostKobo: 1 }] }), {}, TODAY),
    ).rejects.toThrow("disk full");
    expect(await InventoryItemModel.countDocuments({ farmId: owner.farmId, nameKey: "layer mash" })).toBe(0);
  });
});

describe("other expenses", () => {
  it("records transport paid in cash with no receipt, to someone who isn't a supplier", async () => {
    const { manager, batch } = await moneyFarm();
    const { expense } = await createExpense(
      manager,
      {
        category: "transport",
        amountKobo: 1_500_000,
        description: "Feed from Ibadan",
        payeeName: "Okada rider",
        batchId: batch.id,
        method: "cash",
      },
      {},
      TODAY,
    );
    expect(expense).toMatchObject({
      paymentStatus: "paid",
      paidOn: TODAY,
      receipt: null,
      supplierId: null,
      batchId: batch.id,
      lines: [],
      date: TODAY,
    });
  });

  it.each([
    [{ category: "transport", amountKobo: 0, description: "x", method: "cash" }, "amountKobo"],
    [{ category: "transport", amountKobo: 100, description: "", method: "cash" }, "description"],
    [{ category: "gold", amountKobo: 100, description: "x", method: "cash" }, "category"],
    [{ category: "transport", amountKobo: 100, description: "x", method: "barter" }, "method"],
    [{ category: "transport", amountKobo: 100, description: "x", method: "cash", date: "2026-11-27" }, "date"],
    [{ category: "transport", amountKobo: 100, description: "x", method: "paystack" }, "payeeBank"],
    [
      {
        category: "transport",
        amountKobo: 100,
        description: "x",
        method: "later",
        payeeBank: { bankCode: "058", accountNumber: "12" },
      },
      "payeeBank",
    ],
    [{ category: "transport", amountKobo: 1.5, description: "x", method: "cash" }, "amountKobo"],
    [
      {
        category: "transport",
        amountKobo: 100,
        description: "x",
        method: "cash",
        receipt: { url: "javascript:alert(1)" },
      },
      "receipt",
    ],
    [{ lines: [{ itemId: "", quantity: 1, unitCostKobo: 1 }], method: "cash" }, "lines.0"],
    [{ lines: [{ itemId: "x", quantity: 0, unitCostKobo: 1 }], method: "cash" }, "lines.0"],
    [{ lines: [{ itemId: "x", quantity: 1, unitCostKobo: -1 }], method: "cash" }, "lines.0"],
    [{ category: "feed", lines: "feed", method: "cash" }, "lines"],
    [{ category: "transport", amountKobo: 100, description: "x", method: "cash", deliveryKobo: -1 }, "deliveryKobo"],
  ])("refuses %j", async (input, field) => {
    const { manager } = await moneyFarm();
    expect(await refusal(createExpense(manager, input, {}, TODAY))).toMatchObject({ status: 400, field });
  });

  it("refuses another farm's item, supplier or batch, and closed batches", async () => {
    const { owner, batch, purchase } = await moneyFarm();
    const other = await moneyFarm();
    expect(
      await refusal(
        createExpense(owner, purchase({ lines: [{ itemId: other.feed.id, quantity: 1, unitCostKobo: 1 }] }), {}, TODAY),
      ),
    ).toMatchObject({ field: "lines.0" });
    expect(await refusal(createExpense(owner, purchase({ supplierId: other.mill.id }), {}, TODAY))).toMatchObject({
      field: "supplierId",
    });
    expect(await refusal(createExpense(owner, purchase({ batchId: other.batch.id }), {}, TODAY))).toMatchObject({
      field: "batchId",
    });
    await BatchModel.updateOne({ _id: batch.id }, { status: "closed", closedOn: TODAY });
    expect(await refusal(createExpense(owner, purchase({ batchId: batch.id }), {}, TODAY))).toMatchObject({
      code: "closed",
    });
  });

  it("only lets owners choose Paystack, and only for a supplier with a bank account", async () => {
    const { owner, manager, cashOnly, purchase } = await moneyFarm();
    expect(await refusal(createExpense(manager, purchase({ method: "paystack" }), {}, TODAY))).toMatchObject({
      status: 403,
      field: "method",
    });
    expect(
      await refusal(createExpense(owner, purchase({ method: "paystack", supplierId: cashOnly.id }), {}, TODAY)),
    ).toMatchObject({ code: "no_bank" });
    expect((await createExpense(owner, purchase({ method: "paystack" }), {}, TODAY)).expense.paymentStatus).toBe(
      "unpaid",
    );
  });
});

describe("after saving", () => {
  it("marks an owed expense paid outside Fowlex, once, on a sensible day", async () => {
    const { owner, purchase } = await moneyFarm();
    const { expense } = await createExpense(owner, purchase({ date: "2026-11-20" }), {}, TODAY);
    expect(await refusal(markPaid(owner, expense.id, { method: "paystack" }, TODAY))).toMatchObject({
      field: "method",
    });
    expect(await refusal(markPaid(owner, expense.id, { method: "cash", paidOn: "2026-11-19" }, TODAY))).toMatchObject({
      field: "paidOn",
    });
    expect(await markPaid(owner, expense.id, { method: "pos" }, TODAY)).toMatchObject({
      paymentStatus: "paid",
      paidOn: TODAY,
      method: "pos",
    });
    expect(await refusal(markPaid(owner, expense.id, { method: "cash" }, TODAY))).toMatchObject({ code: "paid" });
    await ExpenseModel.updateOne({ _id: expense.id }, { paymentStatus: "paying" });
    expect(await refusal(markPaid(owner, expense.id, { method: "cash" }, TODAY))).toMatchObject({ code: "paying" });
  });

  it("edits notes, receipt, batch and payee only, refusing stale forms", async () => {
    const { owner, batch, purchase } = await moneyFarm();
    const { expense } = await createExpense(owner, purchase(), {}, TODAY);
    const saved = await updateExpense(
      owner,
      expense.id,
      {
        notes: "Delivered late",
        receipt: { url: "/api/uploads/abc", name: "r.jpg" },
        batchId: batch.id,
        amountKobo: 1,
      },
      0,
    );
    expect(saved).toMatchObject({
      notes: "Delivered late",
      receipt: { url: "/api/uploads/abc" },
      batchId: batch.id,
      amountKobo: 36_000_000,
    });
    expect(await refusal(updateExpense(owner, expense.id, { notes: "x" }, 0))).toMatchObject({ code: "stale" });
    expect(await refusal(updateExpense(owner, "nope", { notes: "x" }, 0))).toMatchObject({ status: 404 });
    expect(await getExpense(owner.farmId, expense.id)).toMatchObject({ notes: "Delivered late" });
    expect(await getExpense(owner.farmId, "nope")).toBeNull();
  });

  it("deletes an expense and its stock, but not one with money sent through Paystack", async () => {
    const { owner, feed, purchase } = await moneyFarm();
    const { expense } = await createExpense(owner, purchase(), {}, TODAY);
    await deleteExpense(owner, expense.id);
    expect((await stockLevels(owner.farmId)).get(feed.id)).toBeUndefined();
    expect(await listExpenses(owner.farmId)).toEqual([]);

    const paid = (await createExpense(owner, purchase(), {}, TODAY)).expense;
    await PayoutModel.create({
      farmId: owner.farmId,
      expenseId: paid.id,
      supplierId: paid.supplierId!,
      amountKobo: 1,
      reference: "fwx-test-1",
      status: "success",
      recipient: { code: "R", accountName: "A", accountNumber: "0123456789" },
    });
    expect(await refusal(deleteExpense(owner, paid.id))).toMatchObject({ code: "has_payout" });
    const fee = await ExpenseModel.create({
      farmId: owner.farmId,
      number: "EXP-2026-0099",
      date: TODAY,
      category: "bank-charges",
      amountKobo: 1000,
      method: "paystack",
      paymentStatus: "paid",
      source: { kind: "payout-fee", id: new Types.ObjectId(paid.id) },
    });
    expect(await refusal(deleteExpense(owner, String(fee._id)))).toMatchObject({ code: "automatic" });
    expect(await refusal(updateExpense(owner, String(fee._id), { notes: "x" }, 0))).toMatchObject({
      code: "automatic",
    });
  });

  it("refuses a save that loses a race", async () => {
    const { owner, purchase } = await moneyFarm();
    const { expense } = await createExpense(owner, purchase(), {}, TODAY);
    const lost = Object.assign(new Error("No matching document"), { name: "VersionError" });
    const save = vi.spyOn(ExpenseModel.prototype, "save").mockRejectedValueOnce(lost);
    expect(await refusal(updateExpense(owner, expense.id, { notes: "x" }, 0))).toMatchObject({ code: "stale" });
    save.mockRejectedValueOnce(new Error("disk full"));
    await expect(updateExpense(owner, expense.id, { notes: "x" }, 0)).rejects.toThrow("disk full");
  });
});
