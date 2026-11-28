import { describe, expect, it } from "vitest";

import { kg, lineAmount, orderTotal, validateOrder } from "./rules";
import {
  cancelOrder,
  createOrder,
  deliverOrder,
  listOrders,
  outstanding,
  priceFor,
  quote,
  updateOrder,
} from "./service";
import { createBatch, deleteBatch, getBatch } from "@/lib/batches/service";
import { createContract } from "@/lib/contracts/service";
import { createCustomer } from "@/lib/customers/service";
import { createHouse } from "@/lib/houses/service";
import { getSettings } from "@/lib/settings/service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-27";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string; details?: unknown }) => ({
      status: e.status,
      code: e.code,
      field: e.field,
      details: e.details,
    }),
  );

async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const { batch } = await createBatch(
    owner,
    {
      houseId: house.id,
      placedOn: "2026-10-20",
      breed: "Ross 308",
      delivered: 1000,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
    },
    { confirm: true },
    TODAY,
  );
  const grill = await createCustomer(owner, { name: "The Grill", type: "lounge", creditLimitKobo: 200_000_000 });
  const terms = {
    customerId: grill.id,
    pricing: "perKg",
    priceKobo: 320_000,
    deliveryEvery: "weekly",
    termsDays: 14,
    startDate: "2026-11-01",
    endDate: "2027-10-31",
    activate: true,
  };
  const order = (over: Record<string, unknown> = {}) => ({
    customerId: grill.id,
    deliveryDate: TODAY,
    lines: [{ batchId: batch.id, birds: 200, weightGrams: 0, priceKobo: 1, pricing: "perBird" }],
    deliveryKobo: 500_000,
    notes: "",
    ...over,
  });
  return { owner, batch, grill, terms, order };
}

describe("sales orders", () => {
  it("prices an order for a customer with an active contract from the contract, whatever was typed", async () => {
    const { owner, grill, terms, order } = await farm();
    await createContract(owner, terms, TODAY);
    const o = await createOrder(owner, order());
    expect(o).toMatchObject({ number: "SO-2026-0001", status: "pending", contract: { number: "CON-2026-0001" } });
    expect(o.lines[0]).toMatchObject({ pricing: "perKg", priceKobo: 320_000, weighed: false });
    // Not weighed yet: priced on the batch's weight, and its invoice made with it (not sent).
    expect(o.lines[0].weightGrams).toBeGreaterThan(0);
    expect(o.totalKobo).toBe(Math.round((o.lines[0].weightGrams * 320_000) / 1000) + 500_000);
    expect(o.invoiceId).toBeTruthy();
    expect(await priceFor(owner.farmId, grill.id, "2028-01-01")).toEqual({
      pricing: "perKg",
      priceKobo: null,
      contract: null,
    });
  });

  it("delivering 200 birds lowers the batch's live count by 200, and starts it selling", async () => {
    const { owner, batch, terms, order } = await farm();
    await createContract(owner, terms, TODAY);
    const o = await createOrder(owner, order());
    expect((await getBatch(owner.farmId, batch.id, TODAY))!.liveBirds).toBe(1000);
    const done = await deliverOrder(
      owner,
      o.id,
      { lines: [{ ...o.lines[0], weightGrams: 440_000 }] },
      o.version,
      TODAY,
    );
    expect(done).toMatchObject({ status: "delivered", deliveredOn: TODAY, totalKobo: 140_800_000 + 500_000 });
    const after = (await getBatch(owner.farmId, batch.id, TODAY))!;
    expect(after.liveBirds).toBe(800);
    expect(after.status).toBe("selling");
    expect(await refusal(deliverOrder(owner, o.id, {}, done.version, TODAY))).toMatchObject({ code: "not_pending" });
    expect(await refusal(deleteBatch(owner, batch.id))).toMatchObject({ code: "has_orders" });
  });

  it("won't deliver more birds than the batch has, or before it was placed, or in the future", async () => {
    const { owner, order } = await farm();
    const o = await createOrder(
      owner,
      order({
        lines: [
          { batchId: order().lines[0].batchId, birds: 1200, weightGrams: 0, priceKobo: 850_000, pricing: "perBird" },
        ],
        confirm: true,
      }),
    );
    expect(await refusal(deliverOrder(owner, o.id, { confirm: true }, o.version, TODAY))).toMatchObject({
      code: "not_enough_birds",
      field: "lines.0.birds",
    });
    expect(
      await refusal(deliverOrder(owner, o.id, { deliveredOn: "2026-10-01", confirm: true }, o.version, TODAY)),
    ).toMatchObject({
      code: "not_placed",
    });
    expect(await refusal(deliverOrder(owner, o.id, { deliveredOn: "2026-12-01" }, o.version, TODAY))).toMatchObject({
      field: "deliveredOn",
    });
    expect(await refusal(deliverOrder(owner, o.id, {}, 9, TODAY))).toMatchObject({ code: "stale" });
  });

  it("warns before an order takes a customer over their limit, and saves it when told to", async () => {
    const { owner, grill, order } = await farm();
    const line = { ...order().lines[0], birds: 200, priceKobo: 850_000, pricing: "perBird" };
    await createOrder(owner, order({ lines: [line] }));
    expect(await outstanding(owner.farmId, grill.id)).toBe(170_500_000);
    const over = await refusal(createOrder(owner, order({ lines: [line] })));
    expect(over).toMatchObject({
      status: 409,
      code: "over_credit",
      details: { owedKobo: 170_500_000, addingKobo: 170_500_000, limitKobo: 200_000_000 },
    });
    const saved = await createOrder(owner, order({ lines: [line], confirm: true }));
    expect(saved.number).toBe("SO-2026-0002");
    expect(await quote(owner.farmId, grill.id, TODAY)).toMatchObject({ owedKobo: 341_000_000, limitKobo: 200_000_000 });
    expect(await refusal(quote(owner.farmId, "nope", TODAY))).toMatchObject({ status: 404 });
    expect(await refusal(quote(owner.farmId, grill.id, "x"))).toMatchObject({ field: "deliveryDate" });
  });

  it("changes and cancels an order still to deliver, and lists by customer and batch", async () => {
    const { owner, batch, grill, order } = await farm();
    await (await getSettings(owner.farmId)).set({ defaultPricePerKgKobo: 300_000 }).save();
    expect(await priceFor(owner.farmId, grill.id, TODAY)).toEqual({
      pricing: "perKg",
      priceKobo: 300_000,
      contract: null,
    });
    const o = await createOrder(
      owner,
      order({ lines: [{ batchId: batch.id, birds: 50, weightGrams: 100_000, priceKobo: 300_000, pricing: "perKg" }] }),
    );
    expect(o.totalKobo).toBe(30_000_000 + 500_000);
    const changed = await updateOrder(
      owner,
      o.id,
      order({ deliveryKobo: 0, lines: [{ ...o.lines[0], birds: 60 }] }),
      o.version,
    );
    expect(changed.lines[0].birds).toBe(60);
    expect(await refusal(updateOrder(owner, o.id, order(), o.version))).toMatchObject({ code: "stale" });
    expect((await cancelOrder(owner, o.id)).status).toBe("cancelled");
    expect(await refusal(cancelOrder(owner, o.id))).toMatchObject({ code: "not_pending" });
    expect(await refusal(updateOrder(owner, o.id, order(), changed.version + 1))).toMatchObject({
      code: "not_pending",
    });
    expect((await listOrders(owner.farmId, { customerId: grill.id })).map((x) => x.status)).toEqual(["cancelled"]);
    expect(await listOrders(owner.farmId, { batchId: batch.id })).toHaveLength(1);
    expect(await listOrders(owner.farmId, { batchId: "nope" })).toEqual([]);
    expect(await outstanding(owner.farmId, grill.id)).toBe(0);
  });

  it("refuses an order for someone not on the list, or from a batch not on the farm", async () => {
    const { owner, order } = await farm();
    expect(await refusal(createOrder(owner, order({ customerId: String(oid()) })))).toMatchObject({
      field: "customerId",
    });
    expect(
      await refusal(
        createOrder(owner, order({ lines: [{ ...order().lines[0], batchId: String(oid()), priceKobo: 9 }] })),
      ),
    ).toMatchObject({ field: "lines.0.batchId" });
    expect(await refusal(createOrder(owner, order({ lines: [] })))).toMatchObject({ field: "lines" });
    expect(await refusal(updateOrder(owner, "nope", order(), 0))).toMatchObject({ status: 404 });
  });
});

describe("orders and closed batches", () => {
  it("won't sell from a closed batch, and says a delivered order can't be cancelled", async () => {
    const { owner, batch, order } = await farm();
    const o = await createOrder(owner, order({ lines: [{ ...order().lines[0], birds: 1000, priceKobo: 1 }] }));
    const done = await deliverOrder(owner, o.id, {}, o.version, TODAY);
    expect(await refusal(cancelOrder(owner, done.id))).toMatchObject({ code: "not_pending" });
    const { closeBatch } = await import("@/lib/batches/service");
    const fresh = (await getBatch(owner.farmId, batch.id, TODAY))!;
    await closeBatch(owner, batch.id, { version: fresh.version }, TODAY);
    expect(await refusal(createOrder(owner, order({ lines: [{ ...order().lines[0], priceKobo: 1 }] })))).toMatchObject({
      code: "closed",
      field: "lines.0.batchId",
    });
  });
});

describe("order rules", () => {
  it("adds up lines to the kobo, by the bird or by the kg", () => {
    expect(lineAmount({ birds: 3, weightGrams: 0, priceKobo: 850_000, pricing: "perBird" })).toBe(2_550_000);
    expect(lineAmount({ birds: 3, weightGrams: 6_555, priceKobo: 320_000, pricing: "perKg" })).toBe(2_097_600);
    expect(
      orderTotal({
        deliveryKobo: 100,
        lines: [{ batchId: "x", birds: 1, weightGrams: 0, priceKobo: 1, pricing: "perBird" }],
      }),
    ).toBe(101);
    expect(kg(440_000)).toBe("440 kg");
    expect(kg(1_550)).toBe("1.6 kg");
  });

  it("names what's wrong, and asks for a weight on a per-kg delivery", () => {
    expect(
      Object.keys(validateOrder({ customerId: "x", deliveryDate: "y", deliveryKobo: -1, notes: 1, lines: "x" })),
    ).toEqual(["customerId", "deliveryDate", "deliveryKobo", "notes", "lines"]);
    const line = { batchId: "x", birds: 0, weightGrams: -1, priceKobo: 0, pricing: "x" };
    expect(Object.keys(validateOrder({ lines: [line] }))).toEqual(
      expect.arrayContaining([
        "lines.0.batchId",
        "lines.0.birds",
        "lines.0.weightGrams",
        "lines.0.pricing",
        "lines.0.priceKobo",
      ]),
    );
    expect(validateOrder({ lines: Array(21).fill(line) }).lines).toMatch(/At most/);
    const perKg = { batchId: "a".repeat(24), birds: 1, weightGrams: 0, priceKobo: 1, pricing: "perKg" };
    // Weighing is never required: the batch's weight stands in.
    expect(validateOrder({ lines: [perKg] })["lines.0.weightGrams"]).toBeUndefined();
  });
});
