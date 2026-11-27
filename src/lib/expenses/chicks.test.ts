import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteExpense, listExpenses } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { batchCosts } from "@/lib/batches/costs";
import { createBatch, deleteBatch, getBatch, recordBatchChicks, updateBatch } from "@/lib/batches/service";
import { createHouse } from "@/lib/houses/service";
import { createItem } from "@/lib/inventory/items";
import { recordMovement } from "@/lib/inventory/movements";
import { createLog } from "@/lib/logs/service";
import { clearBankCache } from "@/lib/paystack/banks";
import { resetSimulator } from "@/lib/paystack/simulator";
import { payExpense } from "@/lib/payouts/service";
import { createSupplier } from "@/lib/suppliers/service";
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
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const hatchery = await createSupplier(owner, {
    name: "Amo Byng",
    supplies: ["chicks"],
    bank: { bankCode: "058", accountNumber: "0123456781" },
  });
  const batch = (over: Record<string, unknown> = {}) => ({
    houseId: house.id,
    placedOn: "2026-11-20",
    breed: "Ross 308",
    delivered: 1000,
    freeExtras: 20,
    pricePerChickKobo: 85_000,
    supplierId: hatchery.id,
    targetSellAgeDays: 42,
    targetWeightGrams: 2200,
    ...over,
  });
  const chicks = async (batchId: string) =>
    ExpenseModel.findOne({ "source.kind": "batch", "source.id": batchId }).lean();
  return { owner, manager, hatchery, batch, chicks };
}

describe("placing a batch records its chicks", () => {
  it("as an expense for the chicks paid for, owed to the hatchery, charged to the batch", async () => {
    const { owner, hatchery, batch, chicks } = await farm();
    const { batch: placed } = await createBatch(owner, { ...batch(), supplierName: "typed name ignored" }, {}, TODAY);
    expect(placed).toMatchObject({ supplierId: hatchery.id, supplierName: "Amo Byng" });
    expect(await chicks(placed.id)).toMatchObject({
      category: "chicks",
      description: "980 day-old chicks for B-2026-01 (+20 free)",
      amountKobo: 980 * 85_000,
      date: "2026-11-20",
      paymentStatus: "unpaid",
      method: "later",
      approval: "approved",
      payeeName: "",
    });
    const [listed] = await listExpenses(owner.farmId);
    expect(listed).toMatchObject({ fromBatch: true, automatic: false, batchId: placed.id, supplierId: hatchery.id });
    expect((await getBatch(owner.farmId, placed.id, TODAY))?.chickExpense).toMatchObject({ number: "EXP-2026-0001" });
  });

  it("paid already, to a hatchery typed in, dated today when the chicks are still to come", async () => {
    const { owner, batch, chicks } = await farm();
    const { batch: placed } = await createBatch(
      owner,
      { ...batch({ supplierId: "", supplierName: "Zartech", placedOn: "2026-11-30" }), chicksPaidBy: "cash" },
      {},
      TODAY,
    );
    expect(await chicks(placed.id)).toMatchObject({
      payeeName: "Zartech",
      supplierId: null,
      paymentStatus: "paid",
      paidOn: TODAY,
      date: TODAY,
      method: "cash",
    });
  });

  it("nothing for free chicks; waiting for approval when a manager places a costly batch", async () => {
    const { owner, manager, batch, chicks } = await farm();
    const { batch: free } = await createBatch(owner, batch({ pricePerChickKobo: 0 }), {}, TODAY);
    expect(await chicks(free.id)).toBeNull();
    const { batch: costly } = await createBatch(manager, batch(), { confirm: true }, TODAY);
    expect((await chicks(costly.id))?.approval).toBe("pending");
    expect(
      await refusal(createBatch(owner, batch({ supplierId: String(oid()) }), { confirm: true }, TODAY)),
    ).toMatchObject({ field: "supplierId" });
  });

  it("follows the batch's count, price and hatchery, and goes with it", async () => {
    const { owner, batch, chicks } = await farm();
    const { batch: placed } = await createBatch(owner, batch(), {}, TODAY);
    await updateBatch(
      owner,
      placed.id,
      batch({ delivered: 1100, supplierId: "", supplierName: "Zartech" }),
      { version: 0 },
      TODAY,
    );
    expect(await chicks(placed.id)).toMatchObject({
      amountKobo: 1080 * 85_000,
      payeeName: "Zartech",
      supplierId: null,
    });
    expect(await refusal(deleteExpense(owner, String((await chicks(placed.id))!._id)))).toMatchObject({
      code: "from_batch",
    });
    await updateBatch(owner, placed.id, batch({ pricePerChickKobo: 0 }), { version: 1 }, TODAY);
    expect(await chicks(placed.id)).toBeNull();
    await deleteBatch(owner, placed.id);
    expect(await ExpenseModel.countDocuments({ farmId: owner.farmId })).toBe(0);
  });

  it("keeps the cost and hatchery once the chicks were paid through Paystack", async () => {
    const { owner, batch, chicks } = await farm();
    const { batch: placed } = await createBatch(owner, batch(), {}, TODAY);
    expect((await payExpense(owner, String((await chicks(placed.id))!._id))).status).toBe("success");
    expect(
      await refusal(updateBatch(owner, placed.id, batch({ delivered: 900 }), { version: 0 }, TODAY)),
    ).toMatchObject({ code: "chicks_paid" });
    expect((await updateBatch(owner, placed.id, batch({ notes: "Healthy" }), { version: 0 }, TODAY)).notes).toBe(
      "Healthy",
    );
    expect(await refusal(deleteBatch(owner, placed.id))).toMatchObject({ code: "chicks_paid" });
  });

  it("records the chicks of a batch placed before, once", async () => {
    const { owner, batch, chicks } = await farm();
    const { batch: placed } = await createBatch(owner, batch(), {}, TODAY);
    await ExpenseModel.deleteMany({ farmId: owner.farmId });
    expect((await getBatch(owner.farmId, placed.id, TODAY))?.chickExpense).toBeNull();
    const after = await recordBatchChicks(owner, placed.id, "pos", TODAY);
    expect(after.chickExpense).toMatchObject({ paymentStatus: "paid" });
    expect((await chicks(placed.id))?.method).toBe("pos");
    expect(await refusal(recordBatchChicks(owner, placed.id, "cash", TODAY))).toMatchObject({ code: "recorded" });
    await ExpenseModel.deleteMany({ farmId: owner.farmId });
    expect((await recordBatchChicks(owner, placed.id, "nonsense", TODAY)).chickExpense?.paymentStatus).toBe("unpaid");
  });
});

describe("what a batch has cost", () => {
  it("adds its approved expenses and the stock it used, leaving out equipment and rejected spending", async () => {
    const { owner, manager, batch } = await farm();
    const { batch: placed } = await createBatch(owner, { ...batch(), chicksPaidBy: "transfer" }, {}, TODAY);
    const feed = await createItem(owner, { name: "Starter feed", category: "feed", unit: "bag", unitKg: 25 });
    await recordMovement(
      owner,
      { itemId: feed.id, type: "opening", quantity: 20, unitCostKobo: 1_800_000, date: "2026-11-20" },
      TODAY,
    );
    await createLog(owner, { batchId: placed.id, date: "2026-11-25", feedKg: 50, feedItemId: feed.id }, {}, TODAY);
    const { createExpense } = await import("./service");
    await createExpense(
      owner,
      { category: "transport", amountKobo: 1_000_000, description: "Vet's fare", batchId: placed.id, method: "cash" },
      {},
      TODAY,
    );
    await createExpense(
      owner,
      {
        category: "equipment",
        amountKobo: 5_000_000,
        description: "Drinkers",
        batchId: placed.id,
        method: "cash",
        asset: { name: "Drinkers", kind: "drinkers", usefulLifeMonths: 24 },
      },
      {},
      TODAY,
    );
    await createExpense(
      manager,
      { category: "repairs", amountKobo: 30_000_000, description: "Big repair", batchId: placed.id, method: "later" },
      {},
      TODAY,
    );
    const costs = await batchCosts(owner.farmId, placed.id);
    expect(costs.stock).toEqual([
      { itemId: feed.id, name: "Starter feed", unit: "bag", quantity: 2, costKobo: 3_600_000 },
    ]);
    expect(costs.expenses).toHaveLength(4);
    expect(costs.expensesKobo).toBe(980 * 85_000 + 1_000_000);
    expect(costs.totalKobo).toBe(980 * 85_000 + 1_000_000 + 3_600_000);
    expect(await batchCosts(owner.farmId, "nope")).toMatchObject({ totalKobo: 0 });
  });
});
