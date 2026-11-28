import { describe, expect, it } from "vitest";

import { cancelOrder, createOrder, deleteOrder, deliverOrder, listOrders, outstanding, updateOrder } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch, getBatch } from "@/lib/batches/service";
import { createCustomer } from "@/lib/customers/service";
import { createHouse } from "@/lib/houses/service";
import { createInvoice, getInvoice, listInvoices, sendInvoice } from "@/lib/invoices/service";
import { recordPayment } from "@/lib/payments/service";
import { CollectionModel } from "@/models/collection";
import { InvoiceModel } from "@/models/invoice";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-27";
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
      placedOn: "2026-10-15",
      breed: "Ross 308",
      delivered: 1000,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
    },
    { confirm: true },
    TODAY,
  );
  const grill = await createCustomer(owner, { name: "The Grill", type: "lounge", email: "o@grill.ng", termsDays: 14 });
  const order = (over: Record<string, unknown> = {}) =>
    createOrder(owner, {
      customerId: grill.id,
      deliveryDate: TODAY,
      lines: [{ batchId: batch.id, birds: 100, weightGrams: 0, priceKobo: 850_000, pricing: "perBird" }],
      ...over,
    });
  return { owner, batch, grill, order };
}

describe("an order and its invoice", () => {
  it("are made together: the invoice is a draft, issued on the delivery day, due after the customer's terms", async () => {
    const { owner, grill, order } = await farm();
    const o = await order({ deliveryDate: "2026-12-02" });
    const inv = (await getInvoice(owner.farmId, o.invoiceId!, TODAY))!;
    expect(inv).toMatchObject({
      number: "INV-2026-0001",
      state: "draft",
      issueDate: "2026-12-02",
      dueDate: "2026-12-16",
      totalKobo: 85_000_000,
      orderIds: [o.id],
    });
    // Counted once: the invoice, not the order too.
    expect(await outstanding(owner.farmId, grill.id)).toBe(85_000_000);
  });

  it("change with the order until it's paid, delivered or not; delivery can't take more birds than there are", async () => {
    const { owner, batch, order } = await farm();
    const o = await order();
    const changed = await updateOrder(
      owner,
      o.id,
      { deliveryDate: TODAY, lines: [{ batchId: batch.id, birds: 120, priceKobo: 850_000, pricing: "perBird" }] },
      o.version,
    );
    expect((await getInvoice(owner.farmId, o.invoiceId!, TODAY))!.totalKobo).toBe(102_000_000);
    const delivered = await deliverOrder(owner, o.id, {}, changed.version, TODAY);
    expect((await getBatch(owner.farmId, batch.id, TODAY))!.liveBirds).toBe(880);
    // Delivered, it can still be put right: 110 birds, not 120.
    const fixed = await updateOrder(
      owner,
      o.id,
      { lines: [{ batchId: batch.id, birds: 110, priceKobo: 850_000, pricing: "perBird" }] },
      delivered.version,
    );
    expect(fixed).toMatchObject({ status: "delivered", totalKobo: 93_500_000 });
    expect((await getBatch(owner.farmId, batch.id, TODAY))!.liveBirds).toBe(890);
    expect((await getInvoice(owner.farmId, o.invoiceId!, TODAY))!.totalKobo).toBe(93_500_000);
    expect(
      await refusal(
        updateOrder(
          owner,
          o.id,
          { lines: [{ batchId: batch.id, birds: 1001, priceKobo: 1, pricing: "perBird" }] },
          fixed.version,
        ),
      ),
    ).toMatchObject({ code: "not_enough_birds" });

    // Paid in part: the order stays as it is.
    await recordPayment(owner, o.invoiceId!, { amountKobo: 1_000_000, method: "cash" }, TODAY);
    expect(await refusal(updateOrder(owner, o.id, {}, fixed.version))).toMatchObject({ code: "paid" });
    expect(await refusal(deleteOrder(owner, o.id))).toMatchObject({ code: "paid" });
  });

  it("weighs a per-kg order later: the estimate gives way to the weighing", async () => {
    const { owner, batch, order } = await farm();
    const o = await order({
      lines: [{ batchId: batch.id, birds: 10, weightGrams: 0, priceKobo: 320_000, pricing: "perKg" }],
    });
    expect(o.lines[0]).toMatchObject({ weightGrams: 22_000, weighed: false });
    expect((await getInvoice(owner.farmId, o.invoiceId!, TODAY))!.lines[0].description).toContain(
      "about 22 kg (not weighed yet)",
    );
    const weighed = await deliverOrder(
      owner,
      o.id,
      { lines: [{ batchId: batch.id, birds: 10, weightGrams: 24_500, priceKobo: 320_000, pricing: "perKg" }] },
      o.version,
      TODAY,
    );
    expect(weighed.lines[0]).toMatchObject({ weightGrams: 24_500, weighed: true });
    const inv = (await getInvoice(owner.farmId, o.invoiceId!, TODAY))!;
    expect(inv).toMatchObject({ totalKobo: 7_840_000 });
    expect(inv.lines[0].description).toContain("24.5 kg at");
  });

  it("deleting an order deletes its invoice and gives back what it took", async () => {
    const { owner, batch, grill, order } = await farm();
    // Never sent: the invoice is removed.
    const a = await order();
    const da = await deliverOrder(owner, a.id, {}, a.version, TODAY);
    expect((await getBatch(owner.farmId, batch.id, TODAY))!.liveBirds).toBe(900);
    await deleteOrder(owner, da.id);
    expect((await getBatch(owner.farmId, batch.id, TODAY))!.liveBirds).toBe(1000);
    expect(await getInvoice(owner.farmId, a.invoiceId!, TODAY)).toBeNull();
    expect(await listOrders(owner.farmId)).toEqual([]);
    expect(await outstanding(owner.farmId, grill.id)).toBe(0);

    // Sent to the customer: voided, saying why, so its number still adds up; transfer accounts stop.
    const b = await order();
    await sendInvoice(owner, b.invoiceId!, "https://app.fowlex.com", TODAY);
    await CollectionModel.create({
      farmId: owner.farmId,
      invoiceId: b.invoiceId!,
      reference: `ref-${b.id}`,
      amountKobo: 1,
      email: "x@y.z",
      accountNumber: "1",
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await deleteOrder(owner, b.id);
    expect(await getInvoice(owner.farmId, b.invoiceId!, TODAY)).toMatchObject({
      state: "void",
      voidReason: `${b.number} was deleted`,
    });
    expect((await CollectionModel.findOne({ invoiceId: b.invoiceId }).lean())!.status).toBe("expired");
    expect(await refusal(deleteOrder(owner, "nope"))).toMatchObject({ status: 404 });
  });

  it("cancelling drops the invoice too; billing two orders together keeps the first number", async () => {
    const { owner, order } = await farm();
    const c = await order();
    await cancelOrder(owner, c.id);
    expect(await getInvoice(owner.farmId, c.invoiceId!, TODAY)).toBeNull();

    const [x, y] = [await order(), await order()];
    const [dx, dy] = [
      await deliverOrder(owner, x.id, {}, x.version, TODAY),
      await deliverOrder(owner, y.id, {}, y.version, TODAY),
    ];
    const both = await createInvoice(owner, { orderIds: [dx.id, dy.id] }, TODAY);
    expect(both).toMatchObject({
      number: (await InvoiceModel.findById(x.invoiceId).lean())!.number,
      totalKobo: 170_000_000,
    });
    expect((await listInvoices(owner.farmId, { today: TODAY })).map((i) => i.id)).toEqual([both.id]);
    // On a shared invoice, an order is changed or deleted from there.
    expect(await refusal(deleteOrder(owner, dy.id))).toMatchObject({ code: "on_invoice" });
    expect(await refusal(updateOrder(owner, dy.id, {}, dy.version))).toMatchObject({ code: "not_pending" });
  });
});
