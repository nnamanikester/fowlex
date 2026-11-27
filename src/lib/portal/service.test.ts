import { beforeEach, describe, expect, it } from "vitest";

import { portalCustomer, portalHome, portalInvoice, portalInvoicePdf, portalStatementPdf } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createContract } from "@/lib/contracts/service";
import { createCustomer, getCustomer, inviteCustomer, listCustomers, setCustomerStatus } from "@/lib/customers/service";
import { outbox } from "@/lib/email";
import { createHouse } from "@/lib/houses/service";
import { createInvoice, sendInvoice } from "@/lib/invoices/service";
import { recordPayment } from "@/lib/payments/service";
import { createOrder, deliverOrder } from "@/lib/sales/service";
import { acceptInvite } from "@/lib/users/service";
import { UserModel } from "@/models/user";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  outbox().length = 0;
});

const TODAY = "2026-11-27";
const ORIGIN = "https://app.fowlex.com";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

/** A farm with two customers, each with a sent invoice, and The Grill signed in to the portal. */
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
  const grill = await createCustomer(owner, { name: "The Grill", type: "lounge", email: "orders@grill.ng" });
  const suya = await createCustomer(owner, { name: "Suya Spot", type: "restaurant", email: "suya@spot.ng" });
  const bill = async (customerId: string, birds: number, send = true) => {
    const o = await createOrder(owner, {
      customerId,
      deliveryDate: TODAY,
      lines: [{ batchId: batch.id, birds, weightGrams: 0, priceKobo: 1_000_000, pricing: "perBird" }],
    });
    await deliverOrder(owner, o.id, {}, o.version, TODAY);
    const inv = await createInvoice(owner, { orderIds: [o.id] }, TODAY);
    return send ? sendInvoice(owner, inv.id, ORIGIN, TODAY) : inv;
  };
  await inviteCustomer(owner, grill.id, ORIGIN);
  const token = /token=([\w-]+)/.exec(outbox().at(-1)!.text)![1];
  const accepted = await acceptInvite(token, { name: "Chidi of The Grill", password: "a-long-password-1" });
  if (!accepted.ok) throw new Error(accepted.reason);
  const customerUser: CurrentUser = {
    id: String(accepted.user._id),
    farmId: owner.farmId,
    name: accepted.user.name,
    email: accepted.user.email,
    role: "customer",
  };
  return { owner, grill, suya, bill, customerUser };
}

describe("the customer portal", () => {
  it("invites a customer by email; accepting links their login, and they see their own invoices only", async () => {
    const { owner, grill, suya, bill, customerUser } = await farm();
    expect(outbox().find((m) => m.to === "orders@grill.ng")?.subject).toBe("Your account with Fowlex Farms");
    expect(await getCustomer(owner.farmId, grill.id)).toMatchObject({ hasLogin: true, invited: false });
    expect(customerUser.email).toBe("orders@grill.ng");

    const mine = await bill(grill.id, 30);
    await bill(grill.id, 5, false); // a draft: not theirs to see yet
    const theirs = await bill(suya.id, 20);
    await recordPayment(owner, mine.id, { amountKobo: 10_000_000, method: "cash" }, TODAY);
    await createContract(
      owner,
      {
        customerId: grill.id,
        pricing: "perBird",
        priceKobo: 1_000_000,
        deliveryEvery: "weekly",
        termsDays: 14,
        startDate: "2026-11-01",
        endDate: "2027-10-31",
      },
      TODAY,
    );

    const home = await portalHome(customerUser, TODAY);
    expect(home.customer.name).toBe("The Grill");
    expect(home.invoices.map((i) => i.number)).toEqual([mine.number]);
    expect(home.owedKobo).toBe(20_000_000);
    expect(home.orders).toHaveLength(2);
    expect(home.contracts).toEqual([]); // a draft contract isn't shown
    expect(await portalInvoice(customerUser, mine.id, TODAY)).toMatchObject({
      invoice: { number: mine.number },
      payments: [{ amountKobo: 10_000_000 }],
    });
    // Another customer's invoice, a draft, or nonsense: all "not found".
    expect(await refusal(portalInvoice(customerUser, theirs.id, TODAY))).toMatchObject({ status: 404 });
    expect(await refusal(portalInvoicePdf(customerUser, theirs.id, TODAY))).toMatchObject({ status: 404 });
    expect(await refusal(portalInvoice(customerUser, "nope", TODAY))).toMatchObject({ status: 404 });
    expect((await portalInvoicePdf(customerUser, mine.id, TODAY)).filename).toBe(`Invoice ${mine.number}.pdf`);
    expect((await portalStatementPdf(customerUser, { from: "2026-01-01" }, TODAY)).statement.closingKobo).toBe(
      20_000_000,
    );
  });

  it("is for customers, linked by their invite", async () => {
    const { owner, customerUser } = await farm();
    expect(await refusal(portalCustomer(owner))).toMatchObject({ status: 403 });
    const stray = await UserModel.create({ farmId: owner.farmId, email: "x@y.ng", name: "X", role: "customer" });
    expect(await refusal(portalHome({ ...customerUser, id: String(stray._id) }))).toMatchObject({
      code: "no_customer",
    });
  });

  it("only invites a customer who can be: an email, not archived, not already signed up", async () => {
    const { owner, grill, suya } = await farm();
    expect(await refusal(inviteCustomer(owner, grill.id, ORIGIN))).toMatchObject({ code: "has_login" });
    const quiet = await createCustomer(owner, { name: "No Email", type: "individual" });
    expect(await refusal(inviteCustomer(owner, quiet.id, ORIGIN))).toMatchObject({ code: "no_email", field: "email" });
    await UserModel.create({ farmId: owner.farmId, email: "suya@spot.ng", name: "S", role: "staff" });
    expect(await refusal(inviteCustomer(owner, suya.id, ORIGIN))).toMatchObject({ code: "already_member" });
    const other = await createCustomer(owner, { name: "Hotel", type: "hotel", email: "h@hotel.ng" });
    const invited = await inviteCustomer(owner, other.id, ORIGIN);
    expect(invited.invited).toBe(true);
    expect((await listCustomers(owner.farmId)).find((c) => c.id === other.id)?.invited).toBe(true);
    await setCustomerStatus(owner, other.id, "archived");
    expect(await refusal(inviteCustomer(owner, other.id, ORIGIN))).toMatchObject({ code: "archived" });
  });
});
