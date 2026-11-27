import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/lib/auth/current-user";
import { AuditLogModel } from "@/models/audit-log";
import { FarmModel } from "@/models/farm";
import { UserModel } from "@/models/user";
import { setupTestDb } from "@/test/db";

// cacheLife only works inside Next; here, check the production loaders ask for the session profile.
const cacheLife = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ cacheLife }));

setupTestDb();
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function owner(): Promise<CurrentUser> {
  const farm = await FarmModel.create({ name: "Fowlex Farms" });
  const user = await UserModel.create({ farmId: farm._id, email: "ada@fowlex.com", name: "Ada", role: "owner" });
  return { id: user.id, farmId: String(farm._id), name: "Ada", email: user.email, role: "owner" };
}

describe.each(["production", "development"])("page data in %s", (env) => {
  it("loads settings, the team and the audit log", async () => {
    vi.stubEnv("NODE_ENV", env);
    const {
      loadAssets,
      loadAudit,
      loadBatch,
      loadBatches,
      loadBatchSummaries,
      loadExpenses,
      loadHealth,
      loadHouses,
      loadItems,
      loadLogs,
      loadMovements,
      loadSettings,
      loadSupplierBalances,
      loadSuppliers,
      loadTeam,
    } = await import("./page-data");
    const actor = await owner();
    await AuditLogModel.create({ farmId: actor.farmId, action: "create", model: "User", docId: actor.id });

    expect((await loadSettings(actor.farmId)).invoicePrefix).toBe("INV");
    expect((await loadTeam(actor)).users.map((u) => u.name)).toEqual(["Ada"]);
    expect((await loadAudit(actor)).length).toBeGreaterThan(0);
    expect(await loadHouses(actor.farmId)).toEqual([]);
    expect(await loadBatches(actor.farmId)).toEqual([]);
    expect(await loadBatchSummaries(actor.farmId)).toEqual([]);
    expect(await loadBatch(actor.farmId, actor.id)).toBeNull();
    expect(await loadLogs(actor.farmId, actor.id)).toEqual([]);
    expect(await loadHealth(actor.farmId, actor.id)).toEqual([]);
    expect(await loadItems(actor.farmId)).toEqual([]);
    expect(await loadMovements(actor.farmId, actor.id)).toEqual([]);
    expect(await loadSuppliers(actor.farmId)).toEqual([]);
    expect(await loadExpenses(actor.farmId)).toEqual([]);
    expect(await loadSupplierBalances(actor.farmId)).toEqual(new Map());
    expect(await loadAssets(actor.farmId)).toEqual([]);
    expect(cacheLife.mock.calls.length).toBe(env === "production" ? 15 : 0);
    if (env === "production") expect(cacheLife).toHaveBeenCalledWith("session");
    cacheLife.mockClear();
  });
});
