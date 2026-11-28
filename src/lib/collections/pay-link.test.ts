import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkByLink,
  checkoutByLink,
  payLinkToken,
  payPage,
  returnFromCheckout,
  settleByReference,
  transferByLink,
} from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createCustomer } from "@/lib/customers/service";
import { outbox } from "@/lib/email";
import { createHouse } from "@/lib/houses/service";
import { getInvoice, sendInvoice, voidInvoice } from "@/lib/invoices/service";
import { recordPayment } from "@/lib/payments/service";
import { chargeFee, payCharge, resetSimulator, simulatedCharge } from "@/lib/paystack/simulator";
import { handleWebhook } from "@/lib/paystack/webhook";
import { quickSale } from "@/lib/sales/quick";
import { CollectionModel } from "@/models/collection";
import { ExpenseModel } from "@/models/expense";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "");
  vi.stubEnv("PAYSTACK_SIMULATE", "1");
  resetSimulator();
  outbox().length = 0;
});
afterEach(() => vi.unstubAllEnvs());

const TODAY = "2026-11-28";
const ORIGIN = "https://app.fowlex.com";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string }) => ({ status: e.status, code: e.code }),
  );

/** A farm, a customer with an email, and an unpaid invoice of ₦70,000 (10 birds at ₦7,000). */
async function bill() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  await createBatch(
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
  await createCustomer(owner, { name: "The Grill", type: "lounge", phone: "08031234567", email: "pay@grill.ng" });
  const { invoice } = await quickSale(
    owner,
    { birds: 10, pricing: "perBird", priceKobo: 700_000, paidBy: "later", phone: "0803 123 4567" },
    TODAY,
  );
  return { owner, invoice };
}

describe("an invoice's pay link", () => {
  it("is made once, shows the bill, and pays it through Paystack's checkout, fee booked once", async () => {
    const { owner, invoice } = await bill();
    const token = await payLinkToken(owner.farmId, invoice.id);
    expect(await payLinkToken(owner.farmId, invoice.id)).toBe(token);
    expect(await payPage(token)).toMatchObject({
      number: invoice.number,
      customerName: "The Grill",
      farm: { name: "Fowlex Farms" },
      totalKobo: 7_000_000,
      balanceKobo: 7_000_000,
      account: null,
      lastPaid: null,
    });

    const { url } = await checkoutByLink(token, ORIGIN);
    const [checkout] = await CollectionModel.find({ invoiceId: invoice.id, kind: "checkout" }).lean();
    expect(url).toBe(`${ORIGIN}/dev/paystack/checkout?reference=${checkout.reference}`);
    expect(checkout).toMatchObject({
      amountKobo: 7_000_000,
      email: "pay@grill.ng",
      status: "waiting",
      expiresAt: null,
    });
    expect(simulatedCharge(checkout.reference)).toMatchObject({ callback: `${ORIGIN}/pay/${token}`, paid: false });

    // Back without paying: nothing recorded.
    expect(await returnFromCheckout(token, checkout.reference)).toBe(false);
    payCharge(checkout.reference);
    // Someone else's reference, or a made-up one, is ignored.
    expect(await returnFromCheckout(token, "fwx-chk-nope")).toBe(false);
    expect(await returnFromCheckout("not-a-real-token-xyz", checkout.reference)).toBe(false);
    expect(await returnFromCheckout(token, checkout.reference)).toBe(true);
    expect(await getInvoice(owner.farmId, invoice.id, TODAY)).toMatchObject({ status: "paid", paidKobo: 7_000_000 });
    const fee = chargeFee(7_000_000);
    expect(await ExpenseModel.find({ "source.kind": "collection-fee" }).lean()).toEqual([
      expect.objectContaining({
        amountKobo: fee,
        category: "bank-charges",
        payeeName: "Paystack",
        description: `Paystack fee for taking ${invoice.number} (₦70,000.00)`,
      }),
    ]);
    // Coming back again, or the webhook after it, records nothing more.
    expect(await returnFromCheckout(token, checkout.reference)).toBe(true);
    expect(
      await handleWebhook({ event: "charge.success", data: { reference: checkout.reference, status: "success" } }),
    ).toBe("handled");
    expect(await ExpenseModel.countDocuments({ "source.kind": "collection-fee" })).toBe(1);
    expect((await payPage(token))!).toMatchObject({ balanceKobo: 0, lastPaid: { amountKobo: 7_000_000 } });
    expect(await refusal(checkoutByLink(token, ORIGIN))).toMatchObject({ code: "paid" });
  });

  it("gives a transfer account from the link, checked only for that invoice", async () => {
    const { owner, invoice } = await bill();
    const token = await payLinkToken(owner.farmId, invoice.id);
    const account = await transferByLink(token);
    expect(account).toMatchObject({ amountKobo: 7_000_000, status: "waiting" });
    expect((await payPage(token))!.account?.id).toBe(account.id);
    // An account for another invoice isn't this link's to check.
    const other = await bill();
    const theirs = await transferByLink(await payLinkToken(other.owner.farmId, other.invoice.id));
    expect(await refusal(checkByLink(token, theirs.id))).toMatchObject({ status: 404 });
    payCharge(account.reference);
    expect((await checkByLink(token, account.id)).status).toBe("paid");
    expect(await ExpenseModel.countDocuments({ "source.kind": "collection-fee" })).toBe(1);
  });

  it("goes in the invoice email; a void or unknown link can't be paid", async () => {
    const { owner, invoice } = await bill();
    await sendInvoice(owner, invoice.id, ORIGIN, TODAY);
    const token = await payLinkToken(owner.farmId, invoice.id);
    expect(outbox()[0].text).toContain(`Pay it online, by card, bank app, USSD or transfer:\n${ORIGIN}/pay/${token}`);

    await recordPayment(owner, invoice.id, { amountKobo: 1_000_000, method: "cash" }, TODAY);
    expect((await payPage(token))!.balanceKobo).toBe(6_000_000);
    // A bill made by mistake is voided: its link says so and takes nothing.
    const wrong = await bill();
    const wrongToken = await payLinkToken(wrong.owner.farmId, wrong.invoice.id);
    await voidInvoice(wrong.owner, wrong.invoice.id, "Wrong customer");
    expect((await payPage(wrongToken))!.state).toBe("void");
    expect(await refusal(checkoutByLink(wrongToken, ORIGIN))).toMatchObject({ code: "void" });
    expect(await refusal(payLinkToken(wrong.owner.farmId, wrong.invoice.id))).toMatchObject({ code: "void" });
    expect(await payPage("not-a-real-token-xyz")).toBeNull();
    expect(await payPage("bad token!")).toBeNull();
    expect(await refusal(transferByLink("not-a-real-token-xyz"))).toMatchObject({ status: 404 });
    expect(await refusal(payLinkToken(owner.farmId, "nope"))).toMatchObject({ status: 404 });
    expect(await settleByReference("nobody")).toBe(false);
  });
});
