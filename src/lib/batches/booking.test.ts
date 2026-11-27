import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { paidCount, phaseOf, shortfall } from "./rules";
import { createBatch, getBatch, pickUpBatch, updateBatch } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createHealthEvent } from "@/lib/health/service";
import { createHouse } from "@/lib/houses/service";
import { createLog } from "@/lib/logs/service";
import { clearBankCache } from "@/lib/paystack/banks";
import { resetSimulator } from "@/lib/paystack/simulator";
import { createSupplier } from "@/lib/suppliers/service";
import { ExpenseModel } from "@/models/expense";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "");
  vi.stubEnv("PAYSTACK_SIMULATE", "1");
  clearBankCache();
  resetSimulator();
});
afterEach(() => vi.unstubAllEnvs());

const BOOKED = "2026-11-24";
const PICKUP = "2026-11-27";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const other = await createHouse(owner, { name: "House 2", capacity: 500 });
  const hatchery = await createSupplier(owner, { name: "Amo Byng", supplies: ["chicks"] });
  const booking = (over: Record<string, unknown> = {}) => ({
    booking: true,
    houseId: house.id,
    placedOn: PICKUP,
    breed: "Ross 308",
    delivered: 1000,
    pricePerChickKobo: 85_000,
    supplierId: hatchery.id,
    targetSellAgeDays: 42,
    targetWeightGrams: 2200,
    chicksPaidBy: "transfer",
    ...over,
  });
  const chicks = (id: string) => ExpenseModel.findOne({ "source.kind": "batch", "source.id": id }).lean();
  return { owner, house, other, booking, chicks };
}

describe("booking chicks", () => {
  it("pays now for the chicks booked, and stays booked until they're picked up, even past the day", async () => {
    const { owner, booking, chicks } = await farm();
    const { batch } = await createBatch(owner, booking(), {}, BOOKED);
    expect(batch).toMatchObject({ phase: "planned", pickedUp: false, bookedChicks: 1000, shortfall: 0 });
    expect(await chicks(batch.id)).toMatchObject({
      amountKobo: 1000 * 85_000,
      date: BOOKED,
      paymentStatus: "paid",
      paidOn: BOOKED,
    });
    // The pickup day came and went without anyone collecting them: still booked.
    expect((await getBatch(owner.farmId, batch.id, "2026-11-29"))?.phase).toBe("planned");
  });

  it("keeps daily logs and health records for after the pickup", async () => {
    const { owner, booking } = await farm();
    const { batch } = await createBatch(owner, booking({ placedOn: BOOKED }), {}, BOOKED);
    expect(await refusal(createLog(owner, { batchId: batch.id, date: BOOKED }, {}, BOOKED))).toMatchObject({
      code: "not_picked_up",
    });
    expect(
      await refusal(
        createHealthEvent(owner, { batchId: batch.id, date: BOOKED, kind: "vet-visit", notes: "x" }, {}, BOOKED),
      ),
    ).toMatchObject({ code: "not_picked_up" });
  });

  it("follows edits to the booking before pickup", async () => {
    const { owner, booking, chicks } = await farm();
    const { batch } = await createBatch(owner, booking({ chicksPaidBy: "later" }), {}, BOOKED);
    const edited = await updateBatch(owner, batch.id, booking({ delivered: 1200 }), { version: 0 }, BOOKED);
    expect(edited.bookedChicks).toBe(1200);
    expect((await chicks(batch.id))?.amountKobo).toBe(1200 * 85_000);
  });
});

describe("picking up booked chicks", () => {
  it("starts the batch that day; fewer than paid for is the hatchery's shortfall, and the payment stays", async () => {
    const { owner, booking, chicks } = await farm();
    const { batch } = await createBatch(owner, booking(), {}, BOOKED);
    const placed = await pickUpBatch(
      owner,
      batch.id,
      { delivered: 990, deadOnArrival: 5, freeExtras: 10, pickedUpOn: PICKUP },
      { version: 0 },
      PICKUP,
    );
    expect(placed).toMatchObject({
      phase: "active",
      pickedUp: true,
      placedOn: PICKUP,
      placed: 985,
      bookedChicks: 1000,
      shortfall: 20,
      ageDays: 0,
    });
    expect(await chicks(batch.id)).toMatchObject({ amountKobo: 1000 * 85_000, date: BOOKED });
    expect((await createLog(owner, { batchId: batch.id, date: PICKUP, deaths: 2 }, {}, PICKUP)).created).toBe(true);
    expect(await refusal(pickUpBatch(owner, batch.id, {}, { version: placed.version }, PICKUP))).toMatchObject({
      code: "placed",
    });
  });

  it("doesn't ask about the house again unless they go elsewhere or more come", async () => {
    const { owner, other, booking } = await farm();
    await createBatch(owner, booking({ booking: false, placedOn: "2026-11-01" }), { confirm: true }, BOOKED);
    const { batch } = await createBatch(owner, booking(), { confirm: true }, BOOKED);
    // Same house and count as booked (confirmed then): no question.
    const same = await pickUpBatch(owner, batch.id, { pickedUpOn: PICKUP }, { version: 0 }, PICKUP);
    expect(same.phase).toBe("active");

    const { batch: second } = await createBatch(owner, booking(), { confirm: true }, BOOKED);
    expect(await refusal(pickUpBatch(owner, second.id, { houseId: other.id }, { version: 0 }, PICKUP))).toMatchObject({
      code: "needs_confirmation",
    });
    expect(
      (await pickUpBatch(owner, second.id, { houseId: other.id }, { version: 0, confirm: true }, PICKUP)).houseName,
    ).toBe("House 2");
  });

  it("refuses a day in the future, a stale form and a batch already in the house", async () => {
    const { owner, booking } = await farm();
    const { batch } = await createBatch(owner, booking(), {}, BOOKED);
    expect(
      await refusal(pickUpBatch(owner, batch.id, { pickedUpOn: "2026-11-28" }, { version: 0 }, PICKUP)),
    ).toMatchObject({ field: "pickedUpOn" });
    expect(await refusal(pickUpBatch(owner, batch.id, {}, { version: 3 }, PICKUP))).toMatchObject({ code: "stale" });
    const { batch: placed } = await createBatch(
      owner,
      booking({ booking: false, placedOn: "2026-11-01" }),
      { confirm: true },
      PICKUP,
    );
    expect(await refusal(pickUpBatch(owner, placed.id, {}, { version: 0 }, PICKUP))).toMatchObject({ code: "placed" });
  });

  it("also places a batch set for a later day, on the day they actually came", async () => {
    const { owner, booking } = await farm();
    const { batch } = await createBatch(owner, booking({ booking: false, placedOn: "2026-12-01" }), {}, PICKUP);
    expect(batch.phase).toBe("planned");
    expect((await pickUpBatch(owner, batch.id, {}, { version: 0 }, PICKUP)).placedOn).toBe(PICKUP);
  });
});

describe("booked chick counts", () => {
  it("counts what was paid for, and what didn't come", () => {
    expect(paidCount({ delivered: 990, freeExtras: 10, bookedChicks: 1000 })).toBe(1000);
    expect(paidCount({ delivered: 990, freeExtras: 10 })).toBe(980);
    expect(shortfall({ delivered: 990, freeExtras: 10, bookedChicks: 1000 })).toBe(20);
    expect(shortfall({ delivered: 1030, freeExtras: 20, bookedChicks: 1000 })).toBe(0);
    expect(shortfall({ delivered: 990, freeExtras: 10 })).toBe(0);
    expect(phaseOf({ status: "active", placedOn: "2026-11-01", pickedUp: false }, PICKUP)).toBe("planned");
  });
});
