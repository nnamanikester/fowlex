import { beforeEach, describe, expect, it } from "vitest";

import { dayLabel, estimate, readyOn, slugFrom, validateOnlineOrder } from "./rules";
import { placeOnlineOrder, shopOffer, shopSettings, updateShop } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createContract } from "@/lib/contracts/service";
import { createCustomer, listCustomers } from "@/lib/customers/service";
import { outbox } from "@/lib/email";
import { createHouse } from "@/lib/houses/service";
import { listOrders } from "@/lib/sales/service";
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
  if (on) await updateShop(owner, { enabled: true, pricePerKgKobo: 320_000 });
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
    expect(await shopSettings(owner.farmId)).toMatchObject({
      enabled: false,
      slug: null,
      delivers: true,
      pricePerKgKobo: null,
    });
    expect(await refusal(updateShop(owner, { enabled: true }))).toMatchObject({ field: "pricePerKgKobo" });
    expect(await refusal(updateShop(owner, { pricePerKgKobo: 0 }))).toMatchObject({ field: "pricePerKgKobo" });
    const on = await updateShop(owner, { enabled: true, pricePerKgKobo: 320_000, delivers: false });
    expect(on).toMatchObject({ enabled: true, slug: "fowlex-farms", delivers: false, pricePerKgKobo: 320_000 });
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
    expect(offer).toMatchObject({ pricePerKgKobo: 320_000, readyNow: 300, weightGrams: 2000, delivers: true });
    expect(offer.farm.name).toBe("Fowlex Farms");
    expect(offer.days[0]).toEqual({ date: TODAY, birds: 300 });
    expect(offer.days.find((d) => d.date === "2026-12-01")?.birds).toBe(800);
    expect(offer.days).toHaveLength(14);
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
    expect(placed.estimateKobo).toBe(estimate(400, 2000, 320_000));
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
    expect(order.lines[0]).toMatchObject({ pricing: "perKg", priceKobo: 320_000, weightGrams: 0 });
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
    expect(estimate(10, 2200, 320_000)).toBe(7_040_000);
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
