import { beforeEach, describe, expect, it } from "vitest";

import { defaultName, priceEstimate, priceLabel, validatePrices } from "./prices";
import { dayLabel, readyOn, slugFrom, validateOnlineOrder } from "./rules";
import { farmPrices, placeOnlineOrder, shopOffer, shopSettings, updateShop } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createContract } from "@/lib/contracts/service";
import { createCustomer, listCustomers } from "@/lib/customers/service";
import { outbox } from "@/lib/email";
import { createLog } from "@/lib/logs/service";
import { createHouse } from "@/lib/houses/service";
import { listOrders, priceFor } from "@/lib/sales/service";
import { getSettings } from "@/lib/settings/service";
import { UserModel } from "@/models/user";
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

/** A farm with two batches (one ready now, one in five days) and its order page on at ₦3,200 a kg. */
async function farm({ on = true } = {}) {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  await UserModel.create({ farmId: owner.farmId, email: `ada-${owner.id}@f.com`, name: "Ada", role: "owner" });
  const house = await createHouse(owner, { name: "House 1", capacity: 50_000 });
  const place = async (placedOn: string, delivered: number) =>
    (
      await createBatch(
        owner,
        {
          houseId: house.id,
          placedOn,
          breed: "Ross 308",
          delivered,
          pricePerChickKobo: 85_000,
          targetSellAgeDays: 42,
          targetWeightGrams: 2000,
        },
        { confirm: true },
        TODAY,
      )
    ).batch;
  const old = await place("2026-10-10", 300); // 48 days: ready
  const young = await place("2026-10-27", 500); // ready from 2 Dec (35 days old)
  if (on) await updateShop(owner, { enabled: true, prices: [{ name: "", pricing: "perKg", priceKobo: 320_000 }] });
  const slug = (await shopSettings(owner.farmId)).slug!;
  const form = (over: Record<string, unknown> = {}) => ({
    birds: 50,
    date: TODAY,
    delivery: false,
    name: "Chidi Okafor",
    phone: "0803 123 4567",
    email: "chidi@grill.ng",
    business: "The Grill",
    address: "",
    notes: "",
    ...over,
  });
  return { owner, old, young, slug, form };
}

describe("the order page", () => {
  it("is off until a price is set and it's turned on, then gets an address from the farm's name", async () => {
    const { owner } = await farm({ on: false });
    expect(await shopSettings(owner.farmId)).toMatchObject({ enabled: false, slug: null, delivers: true, prices: [] });
    expect(await refusal(updateShop(owner, { enabled: true }))).toMatchObject({ field: "prices" });
    expect(await refusal(updateShop(owner, { prices: [] }))).toMatchObject({ field: "prices" });
    expect(
      await refusal(updateShop(owner, { prices: [{ name: "", pricing: "perBird", priceKobo: 0 }] })),
    ).toMatchObject({ field: "prices.0.priceKobo" });
    // Per bird is enough: no price per kg needed.
    const on = await updateShop(owner, {
      enabled: true,
      delivers: false,
      prices: [{ name: "", pricing: "perBird", priceKobo: 700_000 }],
    });
    expect(on).toMatchObject({
      enabled: true,
      slug: "fowlex-farms",
      delivers: false,
      prices: [{ name: "Live bird", pricing: "perBird", priceKobo: 700_000 }],
    });
    // Another farm with the same name gets its own address.
    const other = await farm();
    expect(other.slug).toBe("fowlex-farms-2");
    expect((await updateShop(owner, { enabled: false })).slug).toBe("fowlex-farms");
    expect(await shopOffer("fowlex-farms", TODAY)).toBeNull();
    expect(await shopOffer("NOT A SLUG", TODAY)).toBeNull();
  });

  it("offers each day's birds: ready batches now, younger ones from a week before their selling age", async () => {
    const { slug } = await farm();
    const offer = (await shopOffer(slug, TODAY))!;
    expect(offer).toMatchObject({
      prices: [{ name: "By weight", pricing: "perKg", priceKobo: 320_000 }],
      readyNow: 300,
      weightGrams: 2000,
      delivers: true,
    });
    expect(offer.farm.name).toBe("Fowlex Farms");
    expect(offer.days[0]).toEqual({ date: TODAY, birds: 300 });
    expect(offer.days.find((d) => d.date === "2026-12-01")?.birds).toBe(800);
    expect(offer.days).toHaveLength(14);
  });

  it("estimates a bird's weight from ready batches' weighings, not a young batch's", async () => {
    const { owner, young, slug } = await farm();
    // The young batch weighed at 1 kg: it'll be sold at the 2 kg it's grown to, so nothing changes.
    await createLog(owner, { batchId: young.id, date: TODAY, avgWeightGrams: 1000 }, {}, TODAY);
    expect((await shopOffer(slug, TODAY))!.weightGrams).toBe(2000);
  });

  it("books an online order: the customer is added, birds taken oldest first, and the farm and customer emailed", async () => {
    const { owner, old, young, slug, form } = await farm();
    const placed = await placeOnlineOrder(slug, form({ birds: 400, date: "2026-12-02", requestId: "req-00000001" }), {
      today: TODAY,
      origin: "https://app.fowlex.com",
    });
    expect(placed).toMatchObject({
      number: "SO-2026-0001",
      birds: 400,
      date: "2026-12-02",
      delivery: false,
      phone: "+2348031234567",
    });
    expect(placed).toMatchObject({
      estimateKobo: priceEstimate({ pricing: "perKg", priceKobo: 320_000 }, 400, 2000),
      exact: false,
    });
    const [order] = await listOrders(owner.farmId);
    expect(order).toMatchObject({
      source: "online",
      status: "pending",
      contact: { name: "Chidi Okafor", business: "The Grill" },
    });
    expect(order.lines.map((l) => [l.batchId, l.birds])).toEqual([
      [old.id, 300],
      [young.id, 100],
    ]);
    // Priced on the batch's weight until weighed on the day, with its invoice made (not sent).
    expect(order.lines[0]).toMatchObject({
      pricing: "perKg",
      priceKobo: 320_000,
      weightGrams: 300 * 2000,
      weighed: false,
    });
    expect(order.invoiceId).toBeTruthy();
    const [customer] = (await listCustomers(owner.farmId)).filter((c) => !c.walkIn);
    expect(customer).toMatchObject({
      name: "The Grill",
      contactName: "Chidi Okafor",
      phone: "+2348031234567",
      email: "chidi@grill.ng",
    });
    expect(outbox().map((m) => m.subject)).toEqual([
      "New order: 400 birds for The Grill, Wednesday 2 December",
      "Your order SO-2026-0001 with Fowlex Farms",
    ]);
    expect(outbox()[0].text).toContain(`https://app.fowlex.com/sales?open=${order.id}`);

    // The same form sent again books nothing new; what's booked comes off what's offered.
    expect(
      (
        await placeOnlineOrder(slug, form({ birds: 400, date: "2026-12-02", requestId: "req-00000001" }), {
          today: TODAY,
        })
      ).number,
    ).toBe("SO-2026-0001");
    expect((await shopOffer(slug, TODAY))!.days.find((d) => d.date === "2026-12-02")?.birds).toBe(400);
    expect((await shopOffer(slug, TODAY))!.readyNow).toBe(0);
  });

  it("finds the customer by phone and prices by their contract", async () => {
    const { owner, slug, form } = await farm();
    const grill = await createCustomer(owner, { name: "Grill Lounge", type: "lounge", phone: "08031234567" });
    await createContract(
      owner,
      {
        customerId: grill.id,
        pricing: "perBird",
        priceKobo: 900_000,
        deliveryEvery: "weekly",
        termsDays: 7,
        startDate: "2026-11-01",
        endDate: "2027-10-31",
        activate: true,
      },
      TODAY,
    );
    const placed = await placeOnlineOrder(slug, form({ birds: 10, delivery: true, address: "12 Allen Avenue" }), {
      today: TODAY,
    });
    expect(placed.estimateKobo).toBe(9_000_000);
    const [order] = await listOrders(owner.farmId);
    expect(order).toMatchObject({ customerId: grill.id, contract: { number: "CON-2026-0001" }, totalKobo: 9_000_000 });
    expect(order.notes).toBe("Deliver to: 12 Allen Avenue");
    expect((await listCustomers(owner.farmId)).filter((c) => !c.walkIn)).toHaveLength(1);
  });

  it("refuses what can't be booked, in words a customer understands", async () => {
    const { owner, slug, form } = await farm();
    const place = (over: Record<string, unknown>, ip = "1.1.1.1") =>
      refusal(placeOnlineOrder(slug, form(over), { today: TODAY, ip }));
    expect(await place({ birds: 301 })).toMatchObject({ code: "not_enough", field: "birds" });
    expect(await place({ date: "2026-11-26" })).toMatchObject({ field: "date" });
    expect(await place({ phone: "123" })).toMatchObject({ field: "phone" });
    expect(await place({ delivery: true })).toMatchObject({ field: "address" });
    expect(await place({ website: "spam" })).toMatchObject({ code: "invalid_order" });
    expect(await refusal(placeOnlineOrder("nope", form(), { today: TODAY }))).toMatchObject({ status: 404 });
    await updateShop(owner, { delivers: false });
    expect(await place({ delivery: true, address: "Somewhere" })).toMatchObject({ field: "delivery" });
    // Five orders from one address in ten minutes is a person; the sixth isn't.
    for (let n = 0; n < 5; n++) await placeOnlineOrder(slug, form({ birds: 1 }), { today: TODAY, ip: "9.9.9.9" });
    expect(await place({ birds: 1 }, "9.9.9.9")).toMatchObject({ status: 429 });
  });
});

describe("order page rules", () => {
  it("makes addresses, ready days, labels and estimates", () => {
    expect(slugFrom("Fowlex Farms Ltd.")).toBe("fowlex-farms-ltd");
    expect(slugFrom("***")).toBe("farm");
    expect(readyOn("2026-10-27", 42, TODAY)).toBe("2026-12-01");
    expect(readyOn("2026-10-01", 42, TODAY)).toBe(TODAY);
    expect([TODAY, "2026-11-28", "2026-11-30"].map((d) => dayLabel(d, TODAY))).toEqual([
      "Today",
      "Tomorrow",
      "Mon 30 Nov",
    ]);
    expect(priceEstimate({ pricing: "perKg", priceKobo: 320_000 }, 10, 2200)).toBe(7_040_000);
    expect(priceEstimate({ pricing: "perBird", priceKobo: 700_000 }, 10, 2200)).toBe(7_000_000);
    expect(priceLabel({ pricing: "perBird", priceKobo: 700_000 })).toBe("₦7,000 a bird");
    expect(priceLabel({ pricing: "perKg", priceKobo: 320_050 })).toBe("₦3,200.50 a kg");
    expect([defaultName("perKg"), defaultName("perBird")]).toEqual(["By weight", "Live bird"]);
    expect(validatePrices(null)).toEqual({ prices: "Add at least one price." });
    expect(Object.keys(validatePrices(Array.from({ length: 7 }, () => ({}))))).toEqual(["prices"]);
    expect(
      validatePrices([
        { name: "Big", pricing: "perBird", priceKobo: 900_000 },
        { name: "big", pricing: "x", priceKobo: 1.5 },
        { name: "x".repeat(41), pricing: "perKg", priceKobo: 1 },
        null,
      ]),
    ).toEqual({
      "1.pricing": "Choose per bird or per kg.",
      "1.priceKobo": "Enter the price.",
      "1.name": "Give each price its own name.",
      "2.name": "Keep the name short.",
      "3.pricing": "Choose per bird or per kg.",
      "3.priceKobo": "Enter the price.",
    });
    expect(
      Object.keys(
        validateOnlineOrder({
          birds: 0,
          date: "x",
          delivery: "y",
          name: "a",
          phone: "",
          email: "x",
          business: 1,
          address: 1,
          notes: 1,
        }),
      ),
    ).toEqual(["birds", "date", "delivery", "name", "phone", "email", "business", "notes"]);
    expect(validateOnlineOrder({ birds: 200_000 }).birds).toMatch(/call us/);
  });
});

describe("the farm's prices", () => {
  it("sells at several prices: customers choose, the order is priced by their choice, and new orders start from the first", async () => {
    const { owner, form } = await farm({ on: false });
    // A farm that only set a price per kg in Settings has that one until it saves a list.
    await (await getSettings(owner.farmId)).set({ defaultPricePerKgKobo: 300_000 }).save();
    expect(await farmPrices(owner.farmId)).toEqual([
      { id: "kg", name: "By weight", pricing: "perKg", priceKobo: 300_000 },
    ]);
    const { prices } = await updateShop(owner, {
      enabled: true,
      prices: [
        { name: "Live bird", pricing: "perBird", priceKobo: 700_000 },
        { name: "Big bird", pricing: "perBird", priceKobo: 900_000 },
        { name: "", pricing: "perKg", priceKobo: 320_000 },
      ],
    });
    expect(prices.map((p) => p.name)).toEqual(["Live bird", "Big bird", "By weight"]);
    const slug = (await shopSettings(owner.farmId)).slug!;
    // Settings' price per kg follows the list.
    expect((await getSettings(owner.farmId)).defaultPricePerKgKobo).toBe(320_000);
    expect(await priceFor(owner.farmId, String(oid()), TODAY)).toMatchObject({
      pricing: "perBird",
      priceKobo: 700_000,
    });

    // With more than one, the customer must choose.
    expect(await refusal(placeOnlineOrder(slug, form(), { today: TODAY }))).toMatchObject({ field: "priceId" });
    const placed = await placeOnlineOrder(slug, form({ birds: 10, priceId: prices[1].id }), { today: TODAY });
    expect(placed).toMatchObject({ estimateKobo: 9_000_000, exact: true });
    const [order] = await listOrders(owner.farmId);
    expect(order).toMatchObject({ totalKobo: 9_000_000, notes: "Big bird. Collecting from the farm" });
    expect(order.lines[0]).toMatchObject({ pricing: "perBird", priceKobo: 900_000 });
    expect(outbox().find((m) => m.subject.startsWith("Your order"))!.text).toContain("It comes to ₦90,000.00.");

    // Saving keeps each price's id; dropping to one means nothing to choose.
    const again = await updateShop(owner, { prices: [{ ...prices[1], priceKobo: 950_000 }] });
    expect(again.prices).toEqual([{ id: prices[1].id, name: "Big bird", pricing: "perBird", priceKobo: 950_000 }]);
    expect((await placeOnlineOrder(slug, form({ birds: 1 }), { today: TODAY })).estimateKobo).toBe(950_000);
  });
});
