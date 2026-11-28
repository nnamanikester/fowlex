import { beforeEach, describe, expect, it } from "vitest";

import { contractDashboard } from "./dashboard";
import { activateContract, createContract, decideChange, listChanges, listContracts, updateContract } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createCustomer } from "@/lib/customers/service";
import { outbox } from "@/lib/email";
import { createHouse } from "@/lib/houses/service";
import { createInvoice } from "@/lib/invoices/service";
import { recordPayment } from "@/lib/payments/service";
import { createOrder, deliverOrder } from "@/lib/sales/service";
import { UserModel } from "@/models/user";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  outbox().length = 0;
});

const TODAY = "2026-11-28";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

async function farm() {
  const farmId = String(oid());
  const ownerDoc = await UserModel.create({ farmId, email: `o-${farmId}@f.com`, name: "Ada", role: "owner" });
  const salesDoc = await UserModel.create({ farmId, email: `s-${farmId}@f.com`, name: "Bayo", role: "sales" });
  const owner: CurrentUser = { id: String(ownerDoc._id), farmId, name: "Ada", email: ownerDoc.email, role: "owner" };
  const sales: CurrentUser = { id: String(salesDoc._id), farmId, name: "Bayo", email: salesDoc.email, role: "sales" };
  const grill = await createCustomer(owner, { name: "The Grill", type: "lounge", termsDays: 7, phone: "08031234567" });
  const contract = await createContract(
    owner,
    {
      customerId: grill.id,
      pricing: "perBird",
      priceKobo: 700_000,
      minBirds: 100,
      minPer: "week",
      deliveryEvery: "weekly",
      termsDays: 7,
      startDate: "2026-11-02",
      endDate: "2026-12-31",
      notes: "",
      activate: true,
    },
    TODAY,
  );
  const terms = {
    pricing: contract.pricing,
    priceKobo: contract.priceKobo,
    minBirds: contract.minBirds,
    minPer: contract.minPer,
    deliveryEvery: contract.deliveryEvery,
    termsDays: contract.termsDays,
    startDate: contract.startDate,
    endDate: contract.endDate,
    notes: "",
  };
  return { owner, sales, grill, contract, terms };
}

describe("changes to an agreed contract", () => {
  it("wait for an owner: nothing changes until they approve, and the asker is told", async () => {
    const { owner, sales, contract, terms } = await farm();
    const asked = await updateContract(
      sales,
      contract.id,
      { ...terms, priceKobo: 750_000, reason: "Feed went up" },
      contract.version,
      TODAY,
      "https://app.fowlex.com",
    );
    // Still the agreed price; the change is waiting.
    expect(asked.priceKobo).toBe(700_000);
    expect(asked.pendingChange).toMatchObject({
      status: "pending",
      before: { priceKobo: 700_000 },
      after: { priceKobo: 750_000 },
      reason: "Feed went up",
      requestedBy: "Bayo",
    });
    expect(outbox().map((m) => [m.to, m.subject])).toEqual([
      [`o-${owner.farmId}@f.com`, "Bayo asks to change CON-2026-0001"],
    ]);
    expect(outbox()[0].text).toContain(`https://app.fowlex.com/contracts/${contract.id}`);
    // One at a time.
    expect(
      await refusal(updateContract(sales, contract.id, { ...terms, termsDays: 14 }, contract.version, TODAY)),
    ).toMatchObject({
      code: "change_waiting",
    });
    expect((await listContracts(owner.farmId, { today: TODAY }))[0].pendingChange?.id).toBe(asked.pendingChange!.id);

    outbox().length = 0;
    const approved = await decideChange(owner, asked.pendingChange!.id, { approve: true }, TODAY);
    expect(approved).toMatchObject({ priceKobo: 750_000, pendingChange: null });
    expect(outbox()[0]).toMatchObject({
      to: `s-${owner.farmId}@f.com`,
      subject: "Your change to CON-2026-0001 was approved",
    });
    expect(await refusal(decideChange(owner, asked.pendingChange!.id, { approve: true }, TODAY))).toMatchObject({
      code: "decided",
    });
  });

  it("an owner can turn one down, with a reason; an owner's own change applies and is kept on record", async () => {
    const { owner, sales, contract, terms } = await farm();
    const asked = await updateContract(sales, contract.id, { ...terms, minBirds: 50 }, contract.version, TODAY);
    expect(await refusal(decideChange(owner, asked.pendingChange!.id, { approve: false }, TODAY))).toMatchObject({
      field: "note",
    });
    await decideChange(owner, asked.pendingChange!.id, { approve: false, note: "We agreed 100" }, TODAY);
    expect(outbox().at(-1)!.text).toContain("turned down your change: We agreed 100");

    const mine = await updateContract(owner, contract.id, { ...terms, endDate: "2027-01-31" }, contract.version, TODAY);
    expect(mine).toMatchObject({ endDate: "2027-01-31", pendingChange: null });
    // Saving the same terms again changes nothing and records nothing.
    await updateContract(owner, contract.id, { ...terms, endDate: "2027-01-31" }, mine.version, TODAY);
    const history = await listChanges(owner.farmId, contract.id);
    expect(history.map((c) => [c.status, c.requestedBy, c.decidedBy, Object.keys(c.after)])).toEqual([
      ["approved", "Ada", "Ada", ["endDate"]],
      ["rejected", "Bayo", "Ada", ["minBirds"]],
    ]);
    expect(history[1].decisionNote).toBe("We agreed 100");
    expect(await listChanges(owner.farmId, "nope")).toEqual([]);
    expect(await refusal(decideChange(owner, "nope", { approve: true }))).toMatchObject({ status: 404 });
  });

  it("a draft changes freely; an approved change to a contract that has since ended is refused", async () => {
    const { owner, sales, grill, contract, terms } = await farm();
    const draft = await createContract(
      owner,
      { ...terms, customerId: grill.id, startDate: "2027-02-01", endDate: "2027-06-30" },
      TODAY,
    );
    expect(
      (
        await updateContract(
          sales,
          draft.id,
          { ...terms, startDate: "2027-02-01", endDate: "2027-06-30", priceKobo: 1 },
          draft.version,
          TODAY,
        )
      ).priceKobo,
    ).toBe(1);
    const asked = await updateContract(sales, contract.id, { ...terms, priceKobo: 800_000 }, contract.version, TODAY);
    expect(await refusal(decideChange(owner, asked.pendingChange!.id, { approve: true }, "2027-02-15"))).toMatchObject({
      code: "ended",
    });
    // The draft runs after the agreed one ends, so it can be agreed in turn.
    expect((await activateContract(owner, draft.id, TODAY)).status).toBe("active");
  });
});

describe("the contract's dashboard", () => {
  it("brings the agreement, both parties, orders, invoices, payments and how it's being kept", async () => {
    const { owner, grill, contract } = await farm();
    const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
    const { batch } = await createBatch(
      owner,
      {
        houseId: house.id,
        placedOn: "2026-10-01",
        breed: "Ross 308",
        delivered: 1000,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
      },
      { confirm: true },
      "2026-11-02",
    );
    const sell = async (day: string, birds: number, deliver = true) => {
      const o = await createOrder(owner, {
        customerId: grill.id,
        deliveryDate: day,
        lines: [{ batchId: batch.id, birds, weightGrams: 0, priceKobo: 1, pricing: "perBird" }],
        confirm: true,
      });
      return deliver ? deliverOrder(owner, o.id, { confirm: true }, o.version, day) : o;
    };
    const first = await sell("2026-11-04", 100);
    await sell("2026-11-11", 80);
    await sell("2026-12-02", 100, false);
    const invoice = await createInvoice(owner, { orderIds: [first.id] }, "2026-11-04");
    await recordPayment(owner, invoice.id, { amountKobo: invoice.totalKobo, method: "cash" }, "2026-11-09");

    const d = (await contractDashboard(owner.farmId, contract.id, TODAY))!;
    expect(d.customer).toMatchObject({ name: "The Grill", phone: "+2348031234567" });
    expect(d.farm.name).toBe("Fowlex Farms");
    expect(d.orders.map((o) => [o.deliveryDate, o.birds, o.status])).toEqual([
      ["2026-11-04", 100, "invoiced"],
      ["2026-11-11", 80, "delivered"],
      ["2026-12-02", 100, "pending"],
    ]);
    // Priced by the contract, not the line's price.
    expect(d.orders[0].totalKobo).toBe(70_000_000);
    expect(d.invoices).toEqual([expect.objectContaining({ number: invoice.number, paidOn: "2026-11-09" })]);
    expect(d.fulfilment).toMatchObject({
      deliveredToDate: 180,
      promisedToDate: 300,
      bookedAhead: 100,
      avgDaysToPay: 5,
      farm: { state: "keeping" },
      customer: { state: "behind", headline: "They are ordering less than agreed" },
    });
    expect(await contractDashboard(owner.farmId, "nope", TODAY)).toBeNull();
  });
});
