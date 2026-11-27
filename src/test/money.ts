import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createHouse } from "@/lib/houses/service";
import { createItem } from "@/lib/inventory/items";
import { createSupplier } from "@/lib/suppliers/service";
import { oid } from "@/test/db";

export const TODAY = "2026-11-26";

/** A farm with an owner, a manager, feed in stock terms, a batch and two suppliers (one payable). */
export async function moneyFarm() {
  const farmId = String(oid());
  const owner: CurrentUser = { id: String(oid()), farmId, name: "Ada", email: "a@f.com", role: "owner" };
  const manager: CurrentUser = { ...owner, id: String(oid()), role: "manager" };
  const feed = await createItem(owner, {
    name: "Starter feed",
    category: "feed",
    unit: "bag",
    unitKg: 25,
    reorderLevel: 10,
  });
  const drug = await createItem(owner, { name: "Amprolium", category: "medication", unit: "sachet" });
  const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
  const { batch } = await createBatch(
    owner,
    {
      houseId: house.id,
      placedOn: "2026-11-02",
      breed: "Ross 308",
      delivered: 1000,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
    },
    {},
    TODAY,
  );
  const mill = await createSupplier(owner, {
    name: "Feed mill",
    supplies: ["feed"],
    bank: { bankCode: "058", accountNumber: "0123456781" },
  });
  const failing = await createSupplier(owner, {
    name: "Bad account",
    bank: { bankCode: "058", accountNumber: "0123450002" },
  });
  const cashOnly = await createSupplier(owner, { name: "Market woman" });
  const purchase = (over: Record<string, unknown> = {}) => ({
    date: TODAY,
    supplierId: mill.id,
    lines: [{ itemId: feed.id, quantity: 20, unitCostKobo: 1_800_000 }],
    method: "later",
    ...over,
  });
  return { owner, manager, feed, drug, batch, mill, failing, cashOnly, purchase };
}
