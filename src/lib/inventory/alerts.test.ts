import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lowStock, sendLowStockAlerts } from "./alerts";
import { createItem } from "./items";
import { recordMovement } from "./movements";
import { GET as cron } from "@/app/api/cron/low-stock/route";
import { outbox } from "@/lib/email";
import { FarmModel } from "@/models/farm";
import { UserModel } from "@/models/user";
import { setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => outbox().splice(0));
afterEach(() => vi.unstubAllEnvs());

async function farm() {
  const f = await FarmModel.create({ name: "Fowlex Farms" });
  const farmId = String(f._id);
  const owner = await UserModel.create({ farmId, email: "ada@fowlex.com", name: "Ada", role: "owner" });
  await UserModel.create({ farmId, email: "bayo@fowlex.com", name: "Bayo", role: "owner", status: "disabled" });
  await UserModel.create({ farmId, email: "kemi@fowlex.com", name: "Kemi", role: "manager" });
  const actor = { id: String(owner._id), farmId, name: "Ada", email: owner.email, role: "owner" as const };
  const feed = await createItem(actor, {
    name: "Starter feed",
    category: "feed",
    unit: "bag",
    unitKg: 25,
    reorderLevel: 10,
  });
  await createItem(actor, { name: "Diesel", category: "fuel", unit: "litre" });
  await recordMovement(actor, { itemId: feed.id, type: "opening", quantity: 20, unitCostKobo: 1_800_000 });
  return { actor, feed };
}

describe("low-stock alerts", () => {
  it("emails active owners once when stock drops to its reorder level, and again only after a restock", async () => {
    const { actor, feed } = await farm();
    expect(await sendLowStockAlerts("https://app.fowlex.com")).toBe(0);
    expect(await lowStock(actor.farmId)).toEqual([]);

    await recordMovement(actor, { itemId: feed.id, type: "usage", quantity: 12 });
    expect((await lowStock(actor.farmId)).map((i) => i.name)).toEqual(["Starter feed"]);
    expect(await sendLowStockAlerts("https://app.fowlex.com")).toBe(1);
    expect(outbox()).toMatchObject([
      {
        to: "ada@fowlex.com",
        subject: "Starter feed is running low",
        text: expect.stringContaining("- Starter feed: 8 bags left (reorder below 10 bags)"),
      },
    ]);
    expect(outbox()[0].text).toContain("https://app.fowlex.com/inventory");
    // Still low tomorrow: no repeat.
    expect(await sendLowStockAlerts("https://app.fowlex.com")).toBe(0);

    await recordMovement(actor, { itemId: feed.id, type: "opening", quantity: 10, unitCostKobo: 1_800_000 });
    expect(await sendLowStockAlerts("https://app.fowlex.com")).toBe(0);
    await recordMovement(actor, { itemId: feed.id, type: "usage", quantity: 9 });
    expect(await sendLowStockAlerts("https://app.fowlex.com")).toBe(1);
  });

  it("puts several items in one email", async () => {
    const { actor, feed } = await farm();
    const grower = await createItem(actor, {
      name: "Grower feed",
      category: "feed",
      unit: "bag",
      unitKg: 25,
      reorderLevel: 0,
    });
    await recordMovement(actor, { itemId: feed.id, type: "usage", quantity: 15 });
    expect((await lowStock(actor.farmId)).map((i) => i.id)).toEqual([grower.id, feed.id]);
    await sendLowStockAlerts("https://app.fowlex.com");
    expect(outbox()).toHaveLength(1);
    expect(outbox()[0].subject).toBe("2 items are running low at Fowlex Farms");
  });

  it("only runs for Vercel's cron, with the secret", async () => {
    await farm();
    const call = (auth?: string) =>
      cron(new Request("https://app.fowlex.com/api/cron/low-stock", { headers: auth ? { authorization: auth } : {} }));
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0 });
  });
});
