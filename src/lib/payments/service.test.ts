import { describe, expect, it } from "vitest";

import { listPayments, recordPayment, removePayment } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createCustomer } from "@/lib/customers/service";
import { createHouse } from "@/lib/houses/service";
import { createInvoice, getInvoice, voidInvoice } from "@/lib/invoices/service";
import { createOrder, deliverOrder, outstanding } from "@/lib/sales/service";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-27";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

/** A ₦500,000 invoice: 50 birds at ₦10,000, sent to The Grill. */
async function invoiced() {
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
  const grill = await createCustomer(owner, { name: "The Grill", type: "lounge" });
  const o = await createOrder(owner, {
    customerId: grill.id,
    deliveryDate: TODAY,
    lines: [{ batchId: batch.id, birds: 50, weightGrams: 0, priceKobo: 1_000_000, pricing: "perBird" }],
  });
  await deliverOrder(owner, o.id, {}, o.version, TODAY);
  const invoice = await createInvoice(owner, { orderIds: [o.id] }, TODAY);
  return { owner, grill, invoice };
}

describe("payments by hand", () => {
  it("paying ₦300,000 of a ₦500,000 invoice makes it part paid with ₦200,000 left; the rest makes it paid", async () => {
    const { owner, grill, invoice } = await invoiced();
    expect(invoice.totalKobo).toBe(50_000_000);
    const first = await recordPayment(
      owner,
      invoice.id,
      { amountKobo: 30_000_000, method: "bank-transfer", reference: " GTB-1234 ", date: "2026-11-26" },
      TODAY,
    );
    expect(first).toMatchObject({
      amountKobo: 30_000_000,
      method: "bank-transfer",
      reference: "GTB-1234",
      invoiceNumber: invoice.number,
    });
    const part = (await getInvoice(owner.farmId, invoice.id, TODAY))!;
    expect(part).toMatchObject({ status: "part-paid", paidKobo: 30_000_000, balanceKobo: 20_000_000 });
    expect(await outstanding(owner.farmId, grill.id)).toBe(20_000_000);

    expect(
      await refusal(recordPayment(owner, invoice.id, { amountKobo: 20_000_001, method: "cash" }, TODAY)),
    ).toMatchObject({
      field: "amountKobo",
    });
    await recordPayment(owner, invoice.id, { amountKobo: 20_000_000, method: "cash" }, TODAY);
    const paid = (await getInvoice(owner.farmId, invoice.id, TODAY))!;
    expect(paid).toMatchObject({ status: "paid", balanceKobo: 0 });
    expect(await refusal(recordPayment(owner, invoice.id, { amountKobo: 1, method: "cash" }, TODAY))).toMatchObject({
      code: "paid",
    });
    expect(await refusal(voidInvoice(owner, invoice.id, "x", TODAY))).toMatchObject({ code: "has_payments" });
    expect((await listPayments(owner.farmId, { customerId: grill.id })).map((p) => p.amountKobo)).toEqual([
      20_000_000, 30_000_000,
    ]);
  });

  it("two payments recorded at once can't together pay more than the invoice is for", async () => {
    const { owner, invoice } = await invoiced();
    const results = await Promise.allSettled([
      recordPayment(owner, invoice.id, { amountKobo: 40_000_000, method: "cash" }, TODAY),
      recordPayment(owner, invoice.id, { amountKobo: 40_000_000, method: "cash" }, TODAY),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getInvoice(owner.farmId, invoice.id, TODAY))!.paidKobo).toBe(40_000_000);
  });

  it("takes back a payment recorded by mistake, and refuses bad input", async () => {
    const { owner, invoice } = await invoiced();
    const p = await recordPayment(owner, invoice.id, { amountKobo: 10_000_000, method: "paystack" }, TODAY);
    expect(p.date).toBe(TODAY);
    await removePayment(owner, p.id);
    expect((await getInvoice(owner.farmId, invoice.id, TODAY))!.paidKobo).toBe(0);
    expect(await listPayments(owner.farmId, { invoiceId: invoice.id })).toEqual([]);
    expect(await refusal(removePayment(owner, p.id))).toMatchObject({ status: 404 });

    const pay = (input: Record<string, unknown>) => refusal(recordPayment(owner, invoice.id, input, TODAY));
    expect(await pay({ amountKobo: 0, method: "cash" })).toMatchObject({ field: "amountKobo" });
    expect(await pay({ amountKobo: 1, method: "cheque" })).toMatchObject({ field: "method" });
    expect(await pay({ amountKobo: 1, method: "cash", date: "2030-01-01" })).toMatchObject({ field: "date" });
    expect(await refusal(recordPayment(owner, "nope", { amountKobo: 1, method: "cash" }, TODAY))).toMatchObject({
      status: 404,
    });
    expect(await listPayments(owner.farmId, { invoiceId: "nope" })).toEqual([]);
    await voidInvoice(owner, invoice.id, "Mistake", TODAY);
    expect(await pay({ amountKobo: 1, method: "cash" })).toMatchObject({ code: "void" });
  });
});
