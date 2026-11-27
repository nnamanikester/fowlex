import { beforeEach, describe, expect, it } from "vitest";

import { invoiceStatus, invoiceTotals, vatOn } from "./rules";
import {
  createInvoice,
  getInvoice,
  invoicePdf,
  listInvoices,
  sendInvoice,
  updateInvoice,
  voidInvoice,
} from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createContract } from "@/lib/contracts/service";
import { createCustomer } from "@/lib/customers/service";
import { outbox } from "@/lib/email";
import { createHouse } from "@/lib/houses/service";
import { createOrder, deliverOrder, listOrders, outstanding } from "@/lib/sales/service";
import { getSettings } from "@/lib/settings/service";
import { InvoiceModel } from "@/models/invoice";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  outbox().length = 0;
});

const TODAY = "2026-11-27";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

async function farm({ email = "orders@grill.ng" } = {}) {
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
  const grill = await createCustomer(owner, { name: "The Grill", type: "lounge", email, termsDays: 14 });
  /** A delivered order of `birds` at ₦8,500 a bird, with a ₦5,000 delivery charge. */
  const delivered = async (birds = 100, customerId = grill.id) => {
    const o = await createOrder(owner, {
      customerId,
      deliveryDate: TODAY,
      lines: [{ batchId: batch.id, birds, weightGrams: 0, priceKobo: 850_000, pricing: "perBird" }],
      deliveryKobo: 500_000,
    });
    return deliverOrder(owner, o.id, {}, o.version, TODAY);
  };
  return { owner, batch, grill, delivered };
}

describe("invoices", () => {
  it("bills delivered orders with INV numbers from Settings, the customer's terms and the orders marked invoiced", async () => {
    const { owner, grill, delivered } = await farm();
    const [a, b] = [await delivered(100), await delivered(50)];
    const inv = await createInvoice(owner, { orderIds: [a.id, b.id], discountKobo: 1_000_000 }, TODAY);
    expect(inv).toMatchObject({
      number: "INV-2026-0001",
      customerName: "The Grill",
      issueDate: TODAY,
      dueDate: "2026-12-11",
      subtotalKobo: 85_000_000 + 42_500_000 + 1_000_000,
      discountKobo: 1_000_000,
      vatKobo: 0,
      totalKobo: 127_500_000,
      balanceKobo: 127_500_000,
      state: "draft",
      status: "draft",
    });
    expect(inv.lines[0].description).toMatch(/^100 birds from B-\d{4}-\d{2} at ₦8,500\.00 a bird \(SO-2026-0001 on /);
    expect(inv.lines[1]).toMatchObject({ description: "Delivery (SO-2026-0001)", amountKobo: 500_000 });
    expect((await listOrders(owner.farmId, { customerId: grill.id })).every((o) => o.status === "invoiced")).toBe(true);
    // What they owe now comes from the invoice, not the orders, and isn't counted twice.
    expect(await outstanding(owner.farmId, grill.id)).toBe(127_500_000);
    expect(await refusal(createInvoice(owner, { orderIds: [a.id] }, TODAY))).toMatchObject({ code: "not_delivered" });
  });

  it("never repeats or skips a number, even when two invoices are made at the same moment", async () => {
    const { owner, delivered } = await farm();
    const orders = await Promise.all([1, 2, 3, 4].map(() => delivered(10)));
    const made = await Promise.all(orders.map((o) => createInvoice(owner, { orderIds: [o.id] }, TODAY)));
    expect(made.map((i) => i.number).sort()).toEqual([
      "INV-2026-0001",
      "INV-2026-0002",
      "INV-2026-0003",
      "INV-2026-0004",
    ]);
    // A refused one takes no number.
    expect(await refusal(createInvoice(owner, { orderIds: [orders[0].id] }, TODAY))).toMatchObject({
      code: "not_delivered",
    });
    const next = await createInvoice(owner, { orderIds: [(await delivered(5)).id] }, TODAY);
    expect(next.number).toBe("INV-2026-0005");
  });

  it("adds VAT from Settings, follows the contract's terms, and changing the prefix changes the next number", async () => {
    const { owner, grill, delivered } = await farm();
    await (await getSettings(owner.farmId)).set({ vatEnabled: true, vatRateBps: 750, invoicePrefix: "FWX" }).save();
    await createContract(
      owner,
      {
        customerId: grill.id,
        pricing: "perBird",
        priceKobo: 850_000,
        deliveryEvery: "weekly",
        termsDays: 30,
        startDate: "2026-11-01",
        endDate: "2027-10-31",
        activate: true,
      },
      TODAY,
    );
    const inv = await createInvoice(owner, { orderIds: [(await delivered(10)).id] }, TODAY);
    expect(inv).toMatchObject({ number: "FWX-2026-0001", dueDate: "2026-12-27", vatRateBps: 750 });
    expect(inv.vatKobo).toBe(vatOn(9_000_000, 750));
    expect(inv.totalKobo).toBe(9_000_000 + 675_000);
  });

  it("changes a draft, sends it as a PDF by email, and keeps a sent one as the customer has it", async () => {
    const { owner, delivered } = await farm();
    const inv = await createInvoice(owner, { orderIds: [(await delivered(10)).id] }, TODAY);
    const changed = await updateInvoice(
      owner,
      inv.id,
      { discountKobo: 500_000, dueDate: "2026-12-31", notes: "Thanks" },
      inv.version,
      TODAY,
    );
    expect(changed).toMatchObject({
      discountKobo: 500_000,
      totalKobo: 8_500_000,
      dueDate: "2026-12-31",
      notes: "Thanks",
    });
    expect(await refusal(updateInvoice(owner, inv.id, {}, inv.version, TODAY))).toMatchObject({ code: "stale" });
    expect(await refusal(updateInvoice(owner, inv.id, { discountKobo: -1 }, changed.version, TODAY))).toMatchObject({
      field: "discountKobo",
    });
    expect(
      await refusal(updateInvoice(owner, inv.id, { dueDate: "2026-01-01" }, changed.version, TODAY)),
    ).toMatchObject({ field: "dueDate" });

    const sent = await sendInvoice(owner, inv.id, "https://app.fowlex.com", TODAY);
    expect(sent).toMatchObject({ state: "sent", status: "sent", sentTo: "orders@grill.ng" });
    const mail = outbox().at(-1)!;
    expect(mail).toMatchObject({
      to: "orders@grill.ng",
      subject: "Invoice INV-2026-0001 from Fowlex Farms: ₦85,000.00",
    });
    expect(mail.attachments?.[0].filename).toBe("Invoice INV-2026-0001.pdf");
    expect(Buffer.from(mail.attachments![0].content, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    expect(await refusal(updateInvoice(owner, inv.id, {}, sent.version, TODAY))).toMatchObject({ code: "not_draft" });
    // A day past due, it's overdue.
    expect((await getInvoice(owner.farmId, inv.id, "2027-01-01"))?.status).toBe("overdue");
  });

  it("voids one made in error: the number stays, the reason is kept and the orders can be billed again", async () => {
    const { owner, delivered } = await farm();
    const order = await delivered(10);
    const inv = await createInvoice(owner, { orderIds: [order.id] }, TODAY);
    expect(await refusal(voidInvoice(owner, inv.id, " ", TODAY))).toMatchObject({ field: "voidReason" });
    const voided = await voidInvoice(owner, inv.id, "Wrong customer", TODAY);
    expect(voided).toMatchObject({ state: "void", status: "void", balanceKobo: 0, voidReason: "Wrong customer" });
    expect(await refusal(voidInvoice(owner, inv.id, "again", TODAY))).toMatchObject({ code: "void" });
    expect(await refusal(sendInvoice(owner, inv.id, "", TODAY))).toMatchObject({ code: "void" });
    const again = await createInvoice(owner, { orderIds: [order.id] }, TODAY);
    expect(again.number).toBe("INV-2026-0002");
    expect((await listInvoices(owner.farmId)).map((i) => i.number)).toEqual(["INV-2026-0002", "INV-2026-0001"]);
    expect((await invoicePdf(owner.farmId, inv.id, TODAY)).filename).toBe("Invoice INV-2026-0001.pdf");
    await InvoiceModel.updateOne({ _id: again.id }, { $set: { paidKobo: 100 } });
    expect(await refusal(voidInvoice(owner, again.id, "x", TODAY))).toMatchObject({ code: "has_payments" });
  });

  it("refuses what can't be billed: no orders, orders still to deliver, two customers, a big discount, no email", async () => {
    const { owner, batch, delivered } = await farm({ email: "" });
    const other = await createCustomer(owner, { name: "Suya Spot", type: "restaurant" });
    expect(await refusal(createInvoice(owner, { orderIds: [] }, TODAY))).toMatchObject({ field: "orderIds" });
    expect(await refusal(createInvoice(owner, { orderIds: [String(oid())] }, TODAY))).toMatchObject({ status: 404 });
    const pending = await createOrder(owner, {
      customerId: other.id,
      deliveryDate: TODAY,
      lines: [{ batchId: batch.id, birds: 1, weightGrams: 0, priceKobo: 1, pricing: "perBird" }],
    });
    expect(await refusal(createInvoice(owner, { orderIds: [pending.id] }, TODAY))).toMatchObject({
      code: "not_delivered",
    });
    const [a, b] = [await delivered(5), await delivered(5, other.id)];
    expect(await refusal(createInvoice(owner, { orderIds: [a.id, b.id] }, TODAY))).toMatchObject({ field: "orderIds" });
    expect(await refusal(createInvoice(owner, { orderIds: [a.id], discountKobo: 999_999_999 }, TODAY))).toMatchObject({
      field: "discountKobo",
    });
    expect(await refusal(createInvoice(owner, { orderIds: [a.id], issueDate: "2030-01-01" }, TODAY))).toMatchObject({
      field: "issueDate",
    });
    const inv = await createInvoice(owner, { orderIds: [a.id] }, TODAY);
    expect(await refusal(sendInvoice(owner, inv.id, "", TODAY))).toMatchObject({ code: "no_email" });
    expect(await getInvoice(owner.farmId, "nope")).toBeNull();
    expect(await listInvoices(owner.farmId, { customerId: "nope" })).toEqual([]);
    expect(await refusal(invoicePdf(owner.farmId, String(oid())))).toMatchObject({ status: 404 });
  });
});

describe("invoice PDFs and edge cases", () => {
  it("draws VAT, payments, the bank to pay and a second page for a long invoice", async () => {
    const { owner, batch, grill } = await farm();
    await (
      await getSettings(owner.farmId)
    )
      .set({
        vatEnabled: true,
        vatRateBps: 750,
        bankName: "GTBank",
        accountNumber: "0123456789",
        accountName: "Fowlex Farms",
      })
      .save();
    const ids: string[] = [];
    for (const n of [1, 2]) {
      const order = await createOrder(owner, {
        customerId: grill.id,
        deliveryDate: TODAY,
        lines: Array.from({ length: 20 }, () => ({
          batchId: batch.id,
          birds: 5 * n,
          weightGrams: 11_000,
          priceKobo: 320_000,
          pricing: "perKg",
        })),
        deliveryKobo: 500_000,
        confirm: true,
      });
      ids.push((await deliverOrder(owner, order.id, { confirm: true }, order.version, TODAY)).id);
    }
    const inv = await createInvoice(owner, { orderIds: ids, notes: "  Thank you  " }, TODAY);
    expect(inv.notes).toBe("Thank you");
    expect(inv.lines[0].description).toMatch(/, 11 kg at ₦3,200\.00 a kg/);
    await InvoiceModel.updateOne({ _id: inv.id }, { $set: { paidKobo: 1_000_000 } });
    const { bytes } = await invoicePdf(owner.farmId, inv.id, TODAY);
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    await sendInvoice(owner, inv.id, "https://app.fowlex.com", TODAY);
    const again = await sendInvoice(owner, inv.id, "https://app.fowlex.com", TODAY);
    expect(again.state).toBe("sent");
    expect(outbox().at(-1)?.text).toContain(
      "Pay by transfer to Fowlex Farms, GTBank 0123456789, with INV-2026-0001 as the reference.",
    );
  });

  it("refuses bad input and unknown invoices", async () => {
    const { owner, delivered } = await farm();
    const order = await delivered(5);
    expect(await refusal(createInvoice(owner, { orderIds: [order.id], discountKobo: "5" }, TODAY))).toMatchObject({
      field: "discountKobo",
    });
    expect(await refusal(createInvoice(owner, { orderIds: "x" }, TODAY))).toMatchObject({ field: "orderIds" });
    const inv = await createInvoice(owner, { orderIds: [order.id] }, TODAY);
    expect(await refusal(voidInvoice(owner, inv.id, 7, TODAY))).toMatchObject({ field: "voidReason" });
    expect(await refusal(voidInvoice(owner, "nope", "x", TODAY))).toMatchObject({ status: 404 });
    expect(await refusal(updateInvoice(owner, String(oid()), {}, 0, TODAY))).toMatchObject({ status: 404 });
  });
});

describe("invoice rules", () => {
  it("works out status from payments and the due date", () => {
    const i = { state: "sent" as const, totalKobo: 100, paidKobo: 0, dueDate: TODAY };
    expect(invoiceStatus(i, TODAY)).toBe("sent");
    expect(invoiceStatus({ ...i, paidKobo: 40 }, TODAY)).toBe("part-paid");
    expect(invoiceStatus({ ...i, paidKobo: 100 }, "2030-01-01")).toBe("paid");
    expect(invoiceStatus(i, "2026-11-28")).toBe("overdue");
    expect(invoiceStatus({ ...i, state: "draft" }, "2030-01-01")).toBe("draft");
    expect(invoiceStatus({ ...i, state: "draft", paidKobo: 10 }, TODAY)).toBe("part-paid");
    expect(invoiceStatus({ ...i, state: "void" }, TODAY)).toBe("void");
    expect(invoiceTotals([{ amountKobo: 1000 }], 100, 750)).toEqual({
      subtotalKobo: 1000,
      discountKobo: 100,
      vatKobo: 68,
      totalKobo: 968,
    });
    expect(invoiceTotals([{ amountKobo: 50 }], 100, null).totalKobo).toBe(0);
  });
});
