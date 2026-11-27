import { beforeEach, describe, expect, it } from "vitest";

import { agingBand } from "./rules";
import { aging, emailStatement, statementFor, statementPdf } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createCustomer } from "@/lib/customers/service";
import { outbox } from "@/lib/email";
import { createHouse } from "@/lib/houses/service";
import { createInvoice, listInvoices, voidInvoice } from "@/lib/invoices/service";
import { recordPayment, removePayment } from "@/lib/payments/service";
import { createOrder, deliverOrder } from "@/lib/sales/service";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  outbox().length = 0;
});

const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

/** A farm that sells to The Grill, with `bill(kobo, on)` making a delivered order and its invoice dated `on`. */
async function farm({ email = "orders@grill.ng" } = {}) {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const house = await createHouse(owner, { name: "House 1", capacity: 50_000 });
  const { batch } = await createBatch(
    owner,
    {
      houseId: house.id,
      placedOn: "2026-06-01",
      breed: "Ross 308",
      delivered: 20_000,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
    },
    { confirm: true },
    "2026-11-27",
  );
  const grill = await createCustomer(owner, { name: "The Grill", type: "lounge", email, termsDays: 14 });
  const bill = async (kobo: number, on: string, customerId = grill.id) => {
    const o = await createOrder(owner, {
      customerId,
      deliveryDate: on,
      lines: [{ batchId: batch.id, birds: 1, weightGrams: 0, priceKobo: kobo, pricing: "perBird" }],
    });
    await deliverOrder(owner, o.id, { deliveredOn: on }, o.version, on);
    return createInvoice(owner, { orderIds: [o.id], issueDate: on }, on);
  };
  return { owner, grill, bill };
}

describe("customer statements", () => {
  it("closes on what's left on their invoices, and opens on what they owed before", async () => {
    const { owner, grill, bill } = await farm();
    const a = await bill(50_000_000, "2026-07-01");
    const b = await bill(30_000_000, "2026-09-10");
    const c = await bill(20_000_000, "2026-11-20");
    await recordPayment(
      owner,
      a.id,
      { amountKobo: 50_000_000, method: "bank-transfer", reference: "GTB-1", date: "2026-07-20" },
      "2026-11-27",
    );
    await recordPayment(owner, b.id, { amountKobo: 10_000_000, method: "cash", date: "2026-10-01" }, "2026-11-27");
    const taken = await recordPayment(
      owner,
      c.id,
      { amountKobo: 1_000, method: "cash", date: "2026-11-21" },
      "2026-11-27",
    );
    await removePayment(owner, taken.id);
    // A voided invoice is on nobody's statement.
    const v = await bill(9_900_000, "2026-11-22");
    await voidInvoice(owner, v.id, "Wrong price", "2026-11-27");

    const all = await statementFor(owner.farmId, grill.id, { from: "2026-01-01", to: "2026-11-27" }, "2026-11-27");
    const unpaid = (await listInvoices(owner.farmId, { customerId: grill.id, today: "2026-11-27" })).reduce(
      (n, i) => n + i.balanceKobo,
      0,
    );
    expect(all.closingKobo).toBe(unpaid);
    expect(all.closingKobo).toBe(40_000_000);
    expect(all).toMatchObject({ openingKobo: 0, billedKobo: 100_000_000, paidKobo: 60_000_000 });
    expect(all.entries.map((e) => [e.date, e.kind, e.balanceKobo])).toEqual([
      ["2026-07-01", "invoice", 50_000_000],
      ["2026-07-20", "payment", 0],
      ["2026-09-10", "invoice", 30_000_000],
      ["2026-10-01", "payment", 20_000_000],
      ["2026-11-20", "invoice", 40_000_000],
    ]);
    expect(all.entries[1].description).toBe(`Payment for ${a.number}, Bank transfer (GTB-1)`);

    const autumn = await statementFor(owner.farmId, grill.id, { from: "2026-09-01", to: "2026-10-31" }, "2026-11-27");
    expect(autumn).toMatchObject({ openingKobo: 0, closingKobo: 20_000_000 });
    const late = await statementFor(owner.farmId, grill.id, { from: "2026-10-02" }, "2026-11-27");
    expect(late).toMatchObject({ openingKobo: 20_000_000, closingKobo: 40_000_000, range: { to: "2026-11-27" } });
  });

  it("refuses a back-to-front range or an unknown customer", async () => {
    const { owner, grill } = await farm();
    expect(await refusal(statementFor(owner.farmId, grill.id, { from: "2026-12-01", to: "2026-11-01" }))).toMatchObject(
      { field: "from" },
    );
    expect(await refusal(statementFor(owner.farmId, grill.id, {}))).toMatchObject({ field: "from" });
    expect(await refusal(statementFor(owner.farmId, "nope", { from: "2026-01-01" }))).toMatchObject({ status: 404 });
  });

  it("prints across pages and emails the PDF; no email, no statement sent", async () => {
    const { owner, grill, bill } = await farm();
    for (let d = 1; d <= 30; d++) await bill(100_000 * d, `2026-10-${String(d).padStart(2, "0")}`);
    for (let d = 1; d <= 20; d++) {
      const [first] = await listInvoices(owner.farmId, { customerId: grill.id });
      await recordPayment(
        owner,
        first.id,
        { amountKobo: 1_000, method: "cash", date: `2026-11-${String(d).padStart(2, "0")}` },
        "2026-11-27",
      );
    }
    const { bytes, filename } = await statementPdf(
      owner.farmId,
      grill.id,
      { from: "2026-10-01", to: "2026-11-27" },
      "2026-11-27",
    );
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    expect(filename).toBe("Statement The Grill 2026-10-01 to 2026-11-27.pdf");
    expect(await emailStatement(owner, grill.id, { from: "2026-10-01" }, "2026-11-27")).toEqual({
      to: "orders@grill.ng",
    });
    expect(outbox().at(-1)).toMatchObject({
      to: "orders@grill.ng",
      subject: expect.stringMatching(/^Your statement from Fowlex Farms: ₦/),
    });

    const quiet = await farm({ email: "" });
    expect(await refusal(emailStatement(quiet.owner, quiet.grill.id, { from: "2026-01-01" }))).toMatchObject({
      code: "no_email",
    });
  });
});

describe("statement details", () => {
  it("puts an invoice before a payment on the same day, and prints the address and bank", async () => {
    const { owner, grill, bill } = await farm();
    const { getSettings } = await import("@/lib/settings/service");
    await (await getSettings(owner.farmId)).set({ bankName: "GTBank", accountNumber: "0123456789" }).save();
    const { updateCustomer, getCustomer } = await import("@/lib/customers/service");
    const c = (await getCustomer(owner.farmId, grill.id))!;
    await updateCustomer(owner, grill.id, { ...c, address: "12 Allen Avenue, Ikeja" }, c.version);
    const inv = await bill(5_000_000, "2026-11-10");
    await recordPayment(owner, inv.id, { amountKobo: 5_000_000, method: "cash", date: "2026-11-10" }, "2026-11-27");
    await bill(1_000_000, "2026-11-10");
    const s = await statementFor(owner.farmId, grill.id, { from: "2026-11-01" }, "2026-11-27");
    expect(s.entries.map((e) => e.kind)).toEqual(["invoice", "invoice", "payment"]);
    expect(s.customer.address).toBe("12 Allen Avenue, Ikeja");
    const { bytes } = await statementPdf(owner.farmId, grill.id, { from: "2026-11-01" }, "2026-11-27");
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("aging", () => {
  it("groups what's left on each invoice by days past due, per customer and in all", async () => {
    const { owner, grill, bill } = await farm();
    const suya = await createCustomer(owner, { name: "Suya Spot", type: "restaurant", termsDays: 0 });
    await bill(10_000_000, "2026-11-20"); // due 4 Dec: not late
    await bill(20_000_000, "2026-09-20"); // due 4 Oct: 54 days
    const part = await bill(30_000_000, "2026-08-01"); // due 15 Aug: 104 days
    await recordPayment(owner, part.id, { amountKobo: 5_000_000, method: "cash" }, "2026-11-27");
    await bill(7_000_000, "2026-08-20", suya.id); // due 20 Aug: 99 days
    const paid = await bill(1_000_000, "2026-11-01");
    await recordPayment(owner, paid.id, { amountKobo: 1_000_000, method: "cash" }, "2026-11-27");

    const owed = await aging(owner.farmId, "2026-11-27");
    expect(owed.totalKobo).toBe(62_000_000);
    expect(owed.bands).toEqual({ "0-30": 10_000_000, "31-60": 20_000_000, "61-90": 0, "90+": 32_000_000 });
    expect(owed.rows.map((r) => [r.name, r.totalKobo, r.invoices])).toEqual([
      ["The Grill", 55_000_000, 3],
      ["Suya Spot", 7_000_000, 1],
    ]);
    expect(owed.rows[0].customerId).toBe(grill.id);
    expect((await aging(String(oid()))).totalKobo).toBe(0);
  });

  it("bands days past due at 30, 60 and 90", () => {
    expect(
      ["2026-12-01", "2026-10-28", "2026-10-27", "2026-09-28", "2026-09-27", "2026-08-29", "2026-08-28"].map((d) =>
        agingBand(d, "2026-11-27"),
      ),
    ).toEqual(["0-30", "0-30", "31-60", "31-60", "61-90", "61-90", "90+"]);
  });
});
