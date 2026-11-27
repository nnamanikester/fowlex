import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHealthEvent, deleteHealthEvent, updateHealthEvent } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { batchCosts } from "@/lib/batches/costs";
import { createBatch } from "@/lib/batches/service";
import { createExpense, deleteExpense } from "@/lib/expenses/service";
import { createHouse } from "@/lib/houses/service";
import { createItem, listItems } from "@/lib/inventory/items";
import { deleteMovement, recordMovement, stockLevels } from "@/lib/inventory/movements";
import { clearBankCache } from "@/lib/paystack/banks";
import { resetSimulator } from "@/lib/paystack/simulator";
import { payExpense } from "@/lib/payouts/service";
import { createSupplier } from "@/lib/suppliers/service";
import { ExpenseModel } from "@/models/expense";
import { StockMovementModel } from "@/models/stock-movement";
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
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const { batch } = await createBatch(
    owner,
    {
      houseId: house.id,
      placedOn: "2026-11-15",
      breed: "Ross 308",
      delivered: 1000,
      pricePerChickKobo: 0,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
    },
    {},
    TODAY,
  );
  const lasota = await createItem(owner, { name: "Lasota vaccine", category: "vaccine", unit: "vial" });
  await recordMovement(
    owner,
    { itemId: lasota.id, type: "opening", quantity: 10, unitCostKobo: 450_000, date: "2026-11-15" },
    TODAY,
  );
  const event = (over: Record<string, unknown> = {}) => ({
    batchId: batch.id,
    date: "2026-11-22",
    kind: "vaccination",
    product: "Lasota",
    scheduleKey: "nd-1",
    route: "Eye drop",
    ...over,
  });
  const linked = (id: string) =>
    Promise.all([
      StockMovementModel.findOne({ "source.kind": "health", "source.id": id }).lean(),
      ExpenseModel.findOne({ "source.kind": "health", "source.id": id }).lean(),
    ]);
  return { owner, manager, batch, lasota, event, linked };
}

describe("health records and stock", () => {
  it("takes a vaccine from stock, charged to the batch, with no expense of its own", async () => {
    const { owner, batch, lasota, event, linked } = await farm();
    const { event: saved } = await createHealthEvent(
      owner,
      event({ itemId: lasota.id, quantity: 2, costKobo: 999 }),
      {},
      TODAY,
    );
    expect(saved).toMatchObject({ itemId: lasota.id, quantity: 2, costKobo: 0 });
    const [movement, expense] = await linked(saved.id);
    expect(movement).toMatchObject({ type: "usage", quantity: -2, date: "2026-11-22" });
    expect(String(movement!.batchId)).toBe(batch.id);
    expect(expense).toBeNull();
    expect((await stockLevels(owner.farmId)).get(lasota.id)?.onHand).toBe(8);
    expect((await batchCosts(owner.farmId, batch.id)).stock).toMatchObject([
      { name: "Lasota vaccine", quantity: 2, costKobo: 900_000 },
    ]);
    expect(await refusal(deleteMovement(owner, String(movement!._id)))).toMatchObject({ code: "has_source" });
  });

  it("records a drug bought for it as an expense, kept in step and removed with it", async () => {
    const { owner, batch, lasota, event, linked } = await farm();
    const { event: saved } = await createHealthEvent(
      owner,
      event({ kind: "medication", scheduleKey: "", product: "Amprolium", costKobo: 300_000, paidBy: "later" }),
      {},
      TODAY,
    );
    let [, expense] = await linked(saved.id);
    expect(expense).toMatchObject({
      category: "medication",
      description: "Medication: Amprolium",
      amountKobo: 300_000,
      paymentStatus: "unpaid",
      approval: "approved",
    });
    expect(String(expense!.batchId)).toBe(batch.id);
    expect(await refusal(deleteExpense(owner, String(expense!._id)))).toMatchObject({ code: "from_health" });

    const edited = await updateHealthEvent(
      owner,
      saved.id,
      event({ kind: "medication", scheduleKey: "", product: "Amprolium", costKobo: 350_000 }),
      0,
      TODAY,
    );
    [, expense] = await linked(saved.id);
    expect(expense?.amountKobo).toBe(350_000);
    // Now taken from stock instead: the expense goes, the stock comes off.
    await updateHealthEvent(
      owner,
      saved.id,
      event({ kind: "medication", scheduleKey: "", product: "Lasota", itemId: lasota.id, quantity: 1 }),
      edited.version,
      TODAY,
    );
    const [movement, gone] = await linked(saved.id);
    expect(gone).toBeNull();
    expect(movement?.quantity).toBe(-1);
    // Neither stock nor a cost: nothing linked.
    await updateHealthEvent(
      owner,
      saved.id,
      event({ kind: "medication", scheduleKey: "", product: "Lasota" }),
      edited.version + 1,
      TODAY,
    );
    expect(await linked(saved.id)).toEqual([null, null]);
    await updateHealthEvent(
      owner,
      saved.id,
      event({ kind: "vet-visit", scheduleKey: "", product: "", notes: "Checked", costKobo: 500_000 }),
      edited.version + 2,
      TODAY,
    );
    expect((await linked(saved.id))[1]).toMatchObject({ category: "other", description: "Vet visit" });
    await deleteHealthEvent(owner, saved.id);
    expect(await linked(saved.id)).toEqual([null, null]);
  });

  it("waits for approval when a manager records a big cost; locks a cost paid through Paystack", async () => {
    const { owner, manager, event, linked } = await farm();
    const { event: big } = await createHealthEvent(
      manager,
      event({ kind: "vet-visit", scheduleKey: "", product: "", notes: "Outbreak", costKobo: 25_000_000 }),
      {},
      TODAY,
    );
    expect((await linked(big.id))[1]?.approval).toBe("pending");

    const vet = await createSupplier(owner, {
      name: "Dr Bello",
      bank: { bankCode: "058", accountNumber: "0123456781" },
    });
    const { event: paid } = await createHealthEvent(
      owner,
      event({ kind: "vet-visit", scheduleKey: "", product: "", notes: "x", costKobo: 100_000, paidBy: "later" }),
      {},
      TODAY,
    );
    const expenseId = String((await linked(paid.id))[1]!._id);
    await ExpenseModel.updateOne({ _id: expenseId }, { supplierId: vet.id });
    expect((await payExpense(owner, expenseId)).status).toBe("success");
    expect(
      await refusal(
        updateHealthEvent(
          owner,
          paid.id,
          event({ kind: "vet-visit", scheduleKey: "", product: "", notes: "x", costKobo: 200_000 }),
          0,
          TODAY,
        ),
      ),
    ).toMatchObject({ code: "health_paid" });
    expect(
      await refusal(
        updateHealthEvent(
          owner,
          paid.id,
          event({ kind: "vet-visit", scheduleKey: "", product: "", notes: "x" }),
          0,
          TODAY,
        ),
      ),
    ).toMatchObject({ code: "health_paid" });
    expect(await refusal(deleteHealthEvent(owner, paid.id))).toMatchObject({ code: "health_paid" });
  });

  it("only takes drugs and vaccines from the farm's stock, in a quantity", async () => {
    const { owner, event, lasota } = await farm();
    const feed = await createItem(owner, { name: "Starter feed", category: "feed", unit: "kg" });
    expect(await refusal(createHealthEvent(owner, event({ itemId: feed.id, quantity: 1 }), {}, TODAY))).toMatchObject({
      field: "itemId",
    });
    expect(
      await refusal(createHealthEvent(owner, event({ itemId: String(oid()), quantity: 1 }), {}, TODAY)),
    ).toMatchObject({ field: "itemId" });
    expect(await refusal(createHealthEvent(owner, event({ itemId: lasota.id }), {}, TODAY))).toMatchObject({
      field: "quantity",
    });
    expect(await refusal(createHealthEvent(owner, event({ itemId: "bad", quantity: 1 }), {}, TODAY))).toMatchObject({
      field: "itemId",
    });
  });
});

describe("buying again", () => {
  it("remembers who an item was last bought from, and at what price", async () => {
    const { owner, lasota } = await farm();
    const store = await createSupplier(owner, { name: "Agro store" });
    expect((await listItems(owner.farmId)).find((i) => i.id === lasota.id)?.lastBought).toBeNull();
    await createExpense(
      owner,
      {
        supplierId: store.id,
        lines: [{ itemId: lasota.id, quantity: 5, unitCostKobo: 460_000 }],
        method: "cash",
        date: "2026-11-20",
      },
      {},
      TODAY,
    );
    await createExpense(
      owner,
      { lines: [{ itemId: lasota.id, quantity: 5, unitCostKobo: 470_000 }], method: "cash", date: "2026-11-25" },
      {},
      TODAY,
    );
    expect((await listItems(owner.farmId)).find((i) => i.id === lasota.id)?.lastBought).toEqual({
      supplierId: null,
      unitCostKobo: 470_000,
      date: "2026-11-25",
    });
  });
});
