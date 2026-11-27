import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { quickSale } from "./quick";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch, getBatch } from "@/lib/batches/service";
import {
  checkCollection,
  collectByTransfer,
  listCollections,
  payerEmail,
  settleByReference,
} from "@/lib/collections/service";
import {
  createCustomer,
  deleteCustomer,
  inviteCustomer,
  listCustomers,
  setCustomerStatus,
  walkInCustomer,
} from "@/lib/customers/service";
import { createHouse } from "@/lib/houses/service";
import { getInvoice, voidInvoice } from "@/lib/invoices/service";
import { listPayments, recordPayment } from "@/lib/payments/service";
import { payCharge, resetSimulator } from "@/lib/paystack/simulator";
import { paystack } from "@/lib/paystack/client";
import { handleWebhook } from "@/lib/paystack/webhook";
import { CollectionModel } from "@/models/collection";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "");
  vi.stubEnv("PAYSTACK_SIMULATE", "1");
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
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const { batch } = await createBatch(
    owner,
    {
      houseId: house.id,
      placedOn: "2026-10-15",
      breed: "Ross 308",
      delivered: 100,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
    },
    { confirm: true },
    TODAY,
  );
  const sale = (over: Record<string, unknown> = {}) => ({
    birds: 2,
    pricing: "perBird",
    priceKobo: 700_000,
    paidBy: "cash",
    ...over,
  });
  return { owner, batch, sale };
}

describe("selling to anyone, in one go", () => {
  it("sells two birds to a walk-in for cash: delivered, invoiced and paid, with nobody added", async () => {
    const { owner, batch, sale } = await farm();
    const { invoice, collection } = await quickSale(owner, sale(), TODAY);
    expect(collection).toBeNull();
    expect(invoice).toMatchObject({
      customerName: "Walk-in customers",
      totalKobo: 1_400_000,
      status: "paid",
      state: "sent",
    });
    expect((await getBatch(owner.farmId, batch.id, TODAY))!.liveBirds).toBe(98);
    const customers = await listCustomers(owner.farmId);
    expect(customers.map((c) => [c.name, c.walkIn])).toEqual([["Walk-in customers", true]]);
    expect((await listPayments(owner.farmId, { invoiceId: invoice.id }))[0]).toMatchObject({
      method: "cash",
      amountKobo: 1_400_000,
    });
  });

  it("gives a transfer buyer an account that turns paid by itself when the money lands", async () => {
    const { owner, sale } = await farm();
    const { invoice, collection } = await quickSale(owner, sale({ paidBy: "transfer", name: "Mama Nkechi" }), TODAY);
    expect(collection).toMatchObject({
      amountKobo: 1_400_000,
      status: "waiting",
      bankName: "Paystack-Titan",
      invoiceNumber: invoice.number,
    });
    expect(collection!.accountNumber).toMatch(/^\d{10}$/);
    // Paystack was given an email made from the invoice number.
    expect((await CollectionModel.findById(collection!.id).lean())!.email).toBe(
      `customer+${invoice.number.toLowerCase()}@fowlex.com`,
    );
    // Asked again for the same bill, it's the same account.
    expect((await collectByTransfer(owner.farmId, invoice.id, owner.id)).id).toBe(collection!.id);

    expect((await checkCollection(owner.farmId, collection!.id)).status).toBe("waiting");
    payCharge(collection!.reference);
    expect((await checkCollection(owner.farmId, collection!.id)).status).toBe("paid");
    expect(await getInvoice(owner.farmId, invoice.id, TODAY)).toMatchObject({ status: "paid", paidKobo: 1_400_000 });
    // The webhook arriving after the check records nothing twice.
    expect(await settleByReference(collection!.reference)).toBe(false);
    expect(await listPayments(owner.farmId, { invoiceId: invoice.id })).toHaveLength(1);
    expect(await refusal(collectByTransfer(owner.farmId, invoice.id, owner.id))).toMatchObject({ code: "paid" });
  });

  it("settles from Paystack's webhook too, and a later account when the first runs out", async () => {
    const { owner, sale } = await farm();
    const { invoice, collection } = await quickSale(owner, sale({ paidBy: "later" }), TODAY);
    expect(collection).toBeNull();
    expect((await getInvoice(owner.farmId, invoice.id, TODAY))!.status).toBe("sent");
    const first = await collectByTransfer(owner.farmId, invoice.id, owner.id);
    // An hour and a bit later, unpaid: it's expired, and the next ask makes a new account.
    const later = new Date(Date.now() + 61 * 60_000);
    expect((await checkCollection(owner.farmId, first.id, later)).status).toBe("expired");
    const second = await collectByTransfer(owner.farmId, invoice.id, owner.id, later);
    expect(second.id).not.toBe(first.id);
    payCharge(second.reference);
    expect(
      await handleWebhook({ event: "charge.success", data: { reference: second.reference, status: "success" } }),
    ).toBe("handled");
    expect((await getInvoice(owner.farmId, invoice.id, TODAY))!.status).toBe("paid");
    expect((await listCollections(owner.farmId, invoice.id)).map((c) => c.status)).toEqual(["paid", "expired"]);
  });

  it("money landing after the bill was paid another way records nothing more", async () => {
    const { owner, sale } = await farm();
    const { invoice, collection } = await quickSale(owner, sale({ paidBy: "transfer" }), TODAY);
    await recordPayment(owner, invoice.id, { amountKobo: 1_400_000, method: "cash" }, TODAY);
    payCharge(collection!.reference);
    expect((await checkCollection(owner.farmId, collection!.id)).status).toBe("paid");
    expect(await listPayments(owner.farmId, { invoiceId: invoice.id })).toHaveLength(1);
  });

  it("with a phone, finds or adds the customer; per kg needs a weight; never sells more than there are", async () => {
    const { owner, batch, sale } = await farm();
    const known = await createCustomer(owner, {
      name: "Suya Spot",
      type: "restaurant",
      phone: "08031234567",
      email: "s@spot.ng",
    });
    const kg = await quickSale(
      owner,
      sale({ pricing: "perKg", priceKobo: 320_000, weightGrams: 4_400, phone: "0803 123 4567", paidBy: "transfer" }),
      TODAY,
    );
    expect(kg.invoice).toMatchObject({ customerId: known.id, totalKobo: 1_408_000 });
    // Their own email goes to Paystack.
    expect((await CollectionModel.findById(kg.collection!.id).lean())!.email).toBe("s@spot.ng");
    expect(await refusal(quickSale(owner, sale({ pricing: "perKg", priceKobo: 320_000 }), TODAY))).toMatchObject({
      field: "weightGrams",
    });
    expect(await refusal(quickSale(owner, sale({ birds: 99 }), TODAY))).toMatchObject({ code: "not_enough_birds" });
    expect(await refusal(quickSale(owner, sale({ batchId: String(oid()) }), TODAY))).toMatchObject({
      code: "not_enough_birds",
    });
    expect(
      (await quickSale(owner, sale({ batchId: batch.id, phone: "0809 000 1111", name: "Bayo" }), TODAY)).invoice
        .customerName,
    ).toBe("Bayo");
    for (const [over, field] of [
      [{ birds: 0 }, "birds"],
      [{ pricing: "x" }, "pricing"],
      [{ priceKobo: 0 }, "priceKobo"],
      [{ weightGrams: -1 }, "weightGrams"],
      [{ paidBy: "cheque" }, "paidBy"],
      [{ phone: "12" }, "phone"],
      [{ email: "nope" }, "email"],
    ] as const)
      expect(await refusal(quickSale(owner, sale(over), TODAY))).toMatchObject({ field });
  });

  it("keeps the walk-in account: it can't be archived, deleted or invited", async () => {
    const { owner } = await farm();
    const walkIn = await walkInCustomer(owner.farmId);
    expect(String((await walkInCustomer(owner.farmId))._id)).toBe(String(walkIn._id));
    const id = String(walkIn._id);
    expect(await refusal(setCustomerStatus(owner, id, "archived"))).toMatchObject({ code: "walk_in" });
    expect(await refusal(deleteCustomer(owner, id))).toMatchObject({ code: "walk_in" });
    expect(await refusal(inviteCustomer(owner, id, "x"))).toMatchObject({ code: "walk_in" });
    expect(payerEmail("", "INV-2026-0007")).toBe("customer+inv-2026-0007@fowlex.com");
    vi.stubEnv("PAYSTACK_PLACEHOLDER_DOMAIN", "pay.fowlex.ng");
    expect(payerEmail(null, "INV-2026-0007")).toBe("customer+inv-2026-0007@pay.fowlex.ng");
    expect(payerEmail("me@x.ng", "INV-1")).toBe("me@x.ng");
    expect(await refusal(checkCollection(owner.farmId, "nope"))).toMatchObject({ status: 404 });
    expect(await refusal(collectByTransfer(owner.farmId, "nope", owner.id))).toMatchObject({ status: 404 });
    expect(await listCollections(owner.farmId, "nope")).toEqual([]);
  });

  it("won't make an account for a void invoice, and leaves unknown or settled ones alone", async () => {
    const { owner, sale } = await farm();
    const { invoice, collection } = await quickSale(owner, sale({ paidBy: "transfer" }), TODAY);
    await voidInvoice(owner, invoice.id, "Wrong price");
    expect(await refusal(collectByTransfer(owner.farmId, invoice.id, owner.id))).toMatchObject({ code: "void" });
    expect(await settleByReference("nobody")).toBe(false);
    payCharge(collection!.reference);
    expect(await settleByReference(collection!.reference)).toBe(true);
    // Settled already: a check just reads it back.
    expect((await checkCollection(owner.farmId, collection!.id)).status).toBe("paid");
    expect(payCharge("nobody")).toBe(false);
    expect((await paystack("/charge", { method: "POST", body: { amount: 1 } })).httpStatus).toBe(400);
    expect(
      (
        await paystack("/charge", {
          method: "POST",
          body: { email: "a@b.c", amount: 1, reference: collection!.reference },
        })
      ).message,
    ).toBe("Duplicate Transaction Reference");
    expect((await paystack("/transaction/verify/nobody")).httpStatus).toBe(404);
  });
});
