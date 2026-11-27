import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE as deleteBatch, PATCH as updateBatch } from "./batches/[id]/route";
import { POST as batchStatus } from "./batches/[id]/status/route";
import { POST as createBatch } from "./batches/route";
import { GET as outbox } from "./dev/outbox/route";
import { POST as closeBatch } from "./batches/[id]/close/route";
import { DELETE as deleteItem, PATCH as updateItem } from "./inventory/items/[id]/route";
import { GET as listItems, POST as createItem } from "./inventory/items/route";
import { POST as disposeAsset } from "./assets/[id]/dispose/route";
import { DELETE as deleteAsset, PATCH as updateAsset } from "./assets/[id]/route";
import { GET as listAssets, POST as createAsset } from "./assets/route";
import { GET as listBanks } from "./banks/route";
import { PATCH as updateRecurring } from "./recurring/[id]/route";
import { GET as listRecurring } from "./recurring/route";
import { PATCH as updateCategory } from "./expense-categories/[key]/route";
import { GET as listCategories, POST as createCategory } from "./expense-categories/route";
import { POST as approveExpense } from "./expenses/[id]/approve/route";
import { POST as markPaid } from "./expenses/[id]/paid/route";
import { POST as rejectExpense } from "./expenses/[id]/reject/route";
import { GET as payPreview, POST as payExpense } from "./expenses/[id]/pay/route";
import { GET as listPayouts } from "./expenses/[id]/payouts/route";
import { DELETE as deleteExpense, PATCH as updateExpense } from "./expenses/[id]/route";
import { GET as listExpenses, POST as createExpense } from "./expenses/route";
import { POST as checkPayout } from "./payouts/[id]/check/route";
import { POST as submitOtp } from "./payouts/[id]/otp/route";
import { GET as getUpload } from "./uploads/[id]/route";
import { POST as upload } from "./uploads/route";
import { GET as resolveBank } from "./banks/resolve/route";
import { DELETE as deleteMovement } from "./inventory/movements/[id]/route";
import { DELETE as deleteSupplier, PATCH as updateSupplier } from "./suppliers/[id]/route";
import { GET as listSuppliers, POST as createSupplier } from "./suppliers/route";
import { POST as recordMovement } from "./inventory/movements/route";
import { POST as reopenBatch } from "./batches/[id]/reopen/route";
import { DELETE as deleteHealth, PATCH as updateHealth } from "./health/[id]/route";
import { GET as listHealth, POST as createHealth } from "./health/route";
import { DELETE as deleteLog, PATCH as updateLog } from "./logs/[id]/route";
import { GET as listLogs, POST as createLog } from "./logs/route";
import { DELETE as deleteHouse, PATCH as updateHouse } from "./houses/[id]/route";
import { POST as createHouse } from "./houses/route";
import { GET as summary } from "./reports/summary/route";
import { PATCH as saveSettings } from "./settings/route";
import { PATCH as updateMember } from "./users/[id]/route";
import { POST as resend } from "./users/invites/[id]/resend/route";
import { DELETE as revoke } from "./users/invites/[id]/route";
import { POST as invite } from "./users/invites/route";
import type { CurrentUser } from "@/lib/auth/current-user";
import { readSettings } from "@/lib/settings/service";
import { AuditLogModel } from "@/models/audit-log";
import { FarmModel } from "@/models/farm";
import { InviteModel } from "@/models/invite";
import { UserModel } from "@/models/user";
import { setupTestDb } from "@/test/db";

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getSessionUser: async () => session.user,
  getCurrentUser: async () => session.user,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => undefined,
}));

setupTestDb();
beforeEach(() => {
  session.user = null;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

const BASE = "https://app.fowlex.com";
const req = (method: string, path: string, body?: unknown) =>
  new Request(`${BASE}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function signInAs(role: CurrentUser["role"]) {
  const farm = await FarmModel.create({ name: "Fowlex Farms" });
  const user = await UserModel.create({ farmId: farm._id, email: `${role}@fowlex.com`, name: `The ${role}`, role });
  session.user = { id: user.id, farmId: String(farm._id), name: user.name, email: user.email, role };
  return session.user;
}

describe("guards on every route", () => {
  it("401 signed out, 403 for the wrong role", async () => {
    expect((await summary()).status).toBe(401);
    expect((await invite(req("POST", "/api/users/invites", {}))).status).toBe(401);
    await signInAs("manager");
    expect((await invite(req("POST", "/api/users/invites", { email: "x@f.com", role: "staff" }))).status).toBe(403);
    expect((await updateMember(req("PATCH", "/api/users/x", {}), ctx("x"))).status).toBe(403);
    expect((await revoke(req("DELETE", "/api/users/invites/x"), ctx("x"))).status).toBe(403);
    expect((await resend(req("POST", "/api/users/invites/x/resend"), ctx("x"))).status).toBe(403);
    expect((await saveSettings(req("PATCH", "/api/settings", {}))).status).toBe(403);
  });
});

describe("GET /api/reports/summary", () => {
  it("is for roles that read finances", async () => {
    await signInAs("staff");
    expect((await summary()).status).toBe(403);
    const manager = await signInAs("manager");
    const ok = await summary();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ farmId: manager.farmId, revenueKobo: 0, expensesKobo: 0, profitKobo: 0 });
  });
});

describe("user routes", () => {
  it("invite, resend, cancel and change a member, each logged as the owner's", async () => {
    const owner = await signInAs("owner");
    const created = await invite(req("POST", "/api/users/invites", { email: "musa@fowlex.com", role: "manager" }));
    expect(created.status).toBe(201);
    const { id } = await created.json();

    expect((await resend(req("POST", `/api/users/invites/${id}/resend`), ctx(id))).status).toBe(204);
    expect((await revoke(req("DELETE", `/api/users/invites/${id}`), ctx(id))).status).toBe(204);
    expect((await revoke(req("DELETE", `/api/users/invites/${id}`), ctx(id))).status).toBe(404);
    expect((await InviteModel.findById(id))?.revokedAt).toBeInstanceOf(Date);

    const bad = await invite(req("POST", "/api/users/invites", { email: "nope", role: "staff" }));
    expect((await bad.json()).error.code).toBe("invalid_email");

    const staff = await UserModel.create({ farmId: owner.farmId, email: "s@f.com", name: "S", role: "staff" });
    expect(
      (await updateMember(req("PATCH", `/api/users/${staff.id}`, { role: "manager" }), ctx(staff.id))).status,
    ).toBe(204);
    expect((await UserModel.findById(staff._id))?.role).toBe("manager");
    const self = await updateMember(req("PATCH", `/api/users/${owner.id}`, { status: "disabled" }), ctx(owner.id));
    expect((await self.json()).error.code).toBe("self");

    const changed = await AuditLogModel.findOne({ model: "User", action: "update", docId: staff._id }).lean();
    expect(changed).toMatchObject({ actorName: owner.name });
  });
});

describe("PATCH /api/settings", () => {
  it("saves, or names the field that's wrong", async () => {
    const owner = await signInAs("owner");
    const current = await readSettings(owner.farmId);
    const bad = await saveSettings(req("PATCH", "/api/settings", { ...current, invoicePrefix: "TOO-LONG" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.field).toBe("invoicePrefix");

    const ok = await saveSettings(req("PATCH", "/api/settings", { ...current, invoicePrefix: "fwx" }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).invoicePrefix).toBe("FWX");
  });
});

describe("GET /api/dev/outbox", () => {
  it("exists only while Playwright runs the app", async () => {
    vi.stubEnv("PLAYWRIGHT", "");
    expect((await outbox()).status).toBe(404);
    vi.stubEnv("PLAYWRIGHT", "1");
    const response = await outbox();
    expect(response.status).toBe(200);
    expect(Array.isArray(await response.json())).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("bodies that aren't JSON", () => {
  it("are treated as empty, so validation answers", async () => {
    const owner = await signInAs("owner");
    const raw = (method: string, path: string) => new Request(`${BASE}${path}`, { method, body: "{oops" });
    expect((await (await invite(raw("POST", "/api/users/invites"))).json()).error.code).toBe("invalid_email");
    expect((await (await saveSettings(raw("PATCH", "/api/settings"))).json()).error.code).toBe("invalid_settings");
    const member = await updateMember(raw("PATCH", `/api/users/${owner.id}`), ctx(owner.id));
    expect(member.status).toBe(204); // No change asked for: nothing changes but the session version.
  });
});

describe("house routes", () => {
  it("are for owners, and add, edit (refusing stale forms) and delete houses", async () => {
    await signInAs("manager");
    expect((await createHouse(req("POST", "/api/houses", { name: "House 1", capacity: 500 }))).status).toBe(403);

    await signInAs("owner");
    const created = await createHouse(req("POST", "/api/houses", { name: "House 1", capacity: 500 }));
    expect(created.status).toBe(201);
    const house = await created.json();

    const saved = await updateHouse(
      req("PATCH", `/api/houses/${house.id}`, { ...house, capacity: 800 }),
      ctx(house.id),
    );
    expect(await saved.json()).toMatchObject({ capacity: 800, version: 1 });
    const stale = await updateHouse(
      req("PATCH", `/api/houses/${house.id}`, { ...house, capacity: 900 }),
      ctx(house.id),
    );
    expect(stale.status).toBe(409);

    const dup = await createHouse(req("POST", "/api/houses", { name: "house 1", capacity: 5 }));
    expect((await dup.json()).error).toMatchObject({ code: "duplicate_name", field: "name" });

    expect((await deleteHouse(req("DELETE", `/api/houses/${house.id}`), ctx(house.id))).status).toBe(204);
    const raw = new Request(`${BASE}/api/houses`, { method: "POST", body: "{oops" });
    expect((await (await createHouse(raw)).json()).error.field).toBe("name");
    const rawPatch = new Request(`${BASE}/api/houses/${house.id}`, { method: "PATCH", body: "{oops" });
    expect((await updateHouse(rawPatch, ctx(house.id))).status).toBe(400);
  });
});

describe("batch routes", () => {
  it("place (201, retried 200, warnings 409), edit, change status and delete; staff can't", async () => {
    await signInAs("owner");
    const house = await (await createHouse(req("POST", "/api/houses", { name: "House 1", capacity: 100 }))).json();
    const body = {
      houseId: house.id,
      placedOn: new Date().toISOString().slice(0, 10),
      breed: "Arbor Acres",
      delivered: 120,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
      requestId: "route-test-0001",
    };
    const warned = await createBatch(req("POST", "/api/batches", body));
    expect(warned.status).toBe(409);
    expect((await warned.json()).error.details.warnings[0].code).toBe("over_capacity");

    const created = await createBatch(req("POST", "/api/batches", { ...body, confirm: true }));
    expect(created.status).toBe(201);
    const batch = await created.json();
    const retried = await createBatch(req("POST", "/api/batches", { ...body, confirm: true }));
    expect(retried.status).toBe(200);
    expect((await retried.json()).id).toBe(batch.id);

    const saved = await updateBatch(
      req("PATCH", `/api/batches/${batch.id}`, { ...body, breed: "Cobb 500", version: batch.version }),
      ctx(batch.id),
    );
    expect((await saved.json()).breed).toBe("Cobb 500");
    const selling = await batchStatus(
      req("POST", `/api/batches/${batch.id}/status`, { status: "selling" }),
      ctx(batch.id),
    );
    expect((await selling.json()).phase).toBe("selling");
    const rawStatus = new Request(`${BASE}/api/batches/${batch.id}/status`, { method: "POST", body: "{oops" });
    expect((await batchStatus(rawStatus, ctx(batch.id))).status).toBe(400);
    const rawPatch = new Request(`${BASE}/api/batches/${batch.id}`, { method: "PATCH", body: "{oops" });
    expect((await updateBatch(rawPatch, ctx(batch.id))).status).toBe(400);
    expect((await createBatch(new Request(`${BASE}/api/batches`, { method: "POST", body: "{oops" }))).status).toBe(400);

    expect((await deleteBatch(req("DELETE", `/api/batches/${batch.id}`), ctx(batch.id))).status).toBe(204);
    expect((await deleteBatch(req("DELETE", `/api/batches/${batch.id}`), ctx(batch.id))).status).toBe(404);

    await signInAs("staff");
    expect((await createBatch(req("POST", "/api/batches", body))).status).toBe(403);
  });
});

describe("log routes", () => {
  it("record a day (201, resent 200, same day 409), list, edit and delete; customers can't", async () => {
    const owner = await signInAs("owner");
    const house = await (await createHouse(req("POST", "/api/houses", { name: "House 1", capacity: 5000 }))).json();
    const batch = await (
      await createBatch(
        req("POST", "/api/batches", {
          houseId: house.id,
          placedOn: "2026-11-01",
          breed: "Arbor Acres",
          delivered: 1000,
          pricePerChickKobo: 85_000,
          targetSellAgeDays: 42,
          targetWeightGrams: 2200,
          confirm: true,
        }),
      )
    ).json();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
    const body = { batchId: batch.id, date: today, deaths: 3, feedKg: 90, requestId: "route-log-0001" };

    const created = await createLog(req("POST", "/api/logs", body));
    expect(created.status).toBe(201);
    const log = await created.json();
    expect((await createLog(req("POST", "/api/logs", body))).status).toBe(200);
    const again = await createLog(req("POST", "/api/logs", { ...body, requestId: undefined }));
    expect(again.status).toBe(409);
    expect((await again.json()).error).toMatchObject({ code: "already_logged", details: { id: log.id } });

    const listed = await listLogs(req("GET", `/api/logs?batchId=${batch.id}&date=${today}`));
    expect((await listed.json()).map((l: { id: string }) => l.id)).toEqual([log.id]);
    expect(await (await listLogs(req("GET", `/api/logs?batchId=${batch.id}`))).json()).toHaveLength(1);

    const saved = await updateLog(
      req("PATCH", `/api/logs/${log.id}`, { ...body, deaths: 4, version: log.version }),
      ctx(log.id),
    );
    expect((await saved.json()).deaths).toBe(4);
    expect(
      (await updateLog(new Request(`${BASE}/api/logs/${log.id}`, { method: "PATCH", body: "{oops" }), ctx(log.id)))
        .status,
    ).toBe(409); // No version, so refused as stale before anything else.
    expect((await createLog(new Request(`${BASE}/api/logs`, { method: "POST", body: "{oops" }))).status).toBe(400);
    expect((await deleteLog(req("DELETE", `/api/logs/${log.id}`), ctx(log.id))).status).toBe(204);
    void owner;

    await signInAs("customer");
    expect((await createLog(req("POST", "/api/logs", body))).status).toBe(403);
  });
});

describe("health routes", () => {
  it("record (201, resent 200, dose twice 409), list, edit and delete; customers can't", async () => {
    await signInAs("owner");
    const house = await (await createHouse(req("POST", "/api/houses", { name: "House 1", capacity: 5000 }))).json();
    const batch = await (
      await createBatch(
        req("POST", "/api/batches", {
          houseId: house.id,
          placedOn: "2026-11-01",
          breed: "Ross 308",
          delivered: 1000,
          pricePerChickKobo: 85_000,
          targetSellAgeDays: 42,
          targetWeightGrams: 2200,
          confirm: true,
        }),
      )
    ).json();
    const body = {
      batchId: batch.id,
      date: "2026-11-08",
      kind: "vaccination",
      product: "Lasota",
      scheduleKey: "nd-1",
      route: "Eye drop",
      requestId: "route-health-0001",
    };
    const created = await createHealth(req("POST", "/api/health", body));
    expect(created.status).toBe(201);
    const event = await created.json();
    expect((await createHealth(req("POST", "/api/health", body))).status).toBe(200);
    const twice = await createHealth(req("POST", "/api/health", { ...body, requestId: undefined }));
    expect(twice.status).toBe(409);
    expect((await twice.json()).error).toMatchObject({ code: "already_given", details: { id: event.id } });

    expect(await (await listHealth(req("GET", `/api/health?batchId=${batch.id}`))).json()).toHaveLength(1);
    const saved = await updateHealth(
      req("PATCH", `/api/health/${event.id}`, { ...body, givenBy: "Ada", version: event.version }),
      ctx(event.id),
    );
    expect((await saved.json()).givenBy).toBe("Ada");
    expect((await createHealth(new Request(`${BASE}/api/health`, { method: "POST", body: "{oops" }))).status).toBe(400);
    expect(
      (
        await updateHealth(
          new Request(`${BASE}/api/health/${event.id}`, { method: "PATCH", body: "{oops" }),
          ctx(event.id),
        )
      ).status,
    ).toBe(409);
    expect((await deleteHealth(req("DELETE", `/api/health/${event.id}`), ctx(event.id))).status).toBe(204);

    await signInAs("customer");
    expect((await createHealth(req("POST", "/api/health", body))).status).toBe(403);
  });
});

describe("close and reopen routes", () => {
  it("refuse while birds are unaccounted for, then close and reopen; staff can't", async () => {
    const owner = await signInAs("owner");
    const house = await (await createHouse(req("POST", "/api/houses", { name: "House 1", capacity: 5000 }))).json();
    const batch = await (
      await createBatch(
        req("POST", "/api/batches", {
          houseId: house.id,
          placedOn: "2026-11-01",
          breed: "Ross 308",
          delivered: 10,
          pricePerChickKobo: 85_000,
          targetSellAgeDays: 42,
          targetWeightGrams: 2200,
          confirm: true,
        }),
      )
    ).json();
    const close = () =>
      closeBatch(req("POST", `/api/batches/${batch.id}/close`, { version: batch.version }), ctx(batch.id));
    const refused = await close();
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatchObject({
      code: "birds_unaccounted",
      details: { tally: { unaccounted: 10 } },
    });

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
    await createLog(req("POST", "/api/logs", { batchId: batch.id, date: today, deaths: 2, sold: 8 }));
    const closed = await close();
    expect(closed.status).toBe(200);
    expect((await closed.json()).status).toBe("closed");
    expect(
      (
        await closeBatch(
          new Request(`${BASE}/api/batches/${batch.id}/close`, { method: "POST", body: "{oops" }),
          ctx(batch.id),
        )
      ).status,
    ).toBe(409);

    session.user = { ...owner, role: "staff" };
    expect((await reopenBatch(req("POST", `/api/batches/${batch.id}/reopen`), ctx(batch.id))).status).toBe(403);
    session.user = owner;
    const reopened = await reopenBatch(req("POST", `/api/batches/${batch.id}/reopen`), ctx(batch.id));
    expect((await reopened.json()).status).toBe("selling");
  });
});

describe("inventory item routes", () => {
  it("add, list, edit and delete; staff can read but not change", async () => {
    const manager = await signInAs("manager");
    const body = { name: "Starter feed", category: "feed", unit: "bag", unitKg: 25, reorderLevel: 10 };
    const created = await createItem(req("POST", "/api/inventory/items", body));
    expect(created.status).toBe(201);
    const item = await created.json();
    expect(await (await listItems()).json()).toHaveLength(1);
    const saved = await updateItem(
      req("PATCH", `/api/inventory/items/${item.id}`, { ...body, reorderLevel: 12, version: item.version }),
      ctx(item.id),
    );
    expect((await saved.json()).reorderLevel).toBe(12);
    expect(
      (await createItem(new Request(`${BASE}/api/inventory/items`, { method: "POST", body: "{oops" }))).status,
    ).toBe(400);
    expect(
      (
        await updateItem(
          new Request(`${BASE}/api/inventory/items/${item.id}`, { method: "PATCH", body: "{oops" }),
          ctx(item.id),
        )
      ).status,
    ).toBe(400);

    session.user = { ...manager, role: "staff" };
    expect((await listItems()).status).toBe(200);
    expect((await createItem(req("POST", "/api/inventory/items", body))).status).toBe(403);
    session.user = manager;
    expect((await deleteItem(req("DELETE", `/api/inventory/items/${item.id}`), ctx(item.id))).status).toBe(204);
  });
});

describe("stock movement routes", () => {
  it("record opening stock (201), a matching count (204) and delete; staff can't", async () => {
    const manager = await signInAs("manager");
    const item = await (
      await createItem(req("POST", "/api/inventory/items", { name: "Diesel", category: "fuel", unit: "litre" }))
    ).json();
    const opening = await recordMovement(
      req("POST", "/api/inventory/movements", {
        itemId: item.id,
        type: "opening",
        quantity: 50,
        unitCostKobo: 120_000,
      }),
    );
    expect(opening.status).toBe(201);
    const movement = await opening.json();
    expect(
      (await recordMovement(req("POST", "/api/inventory/movements", { itemId: item.id, type: "count", counted: 50 })))
        .status,
    ).toBe(204);
    expect(
      (await recordMovement(new Request(`${BASE}/api/inventory/movements`, { method: "POST", body: "{oops" }))).status,
    ).toBe(400);
    session.user = { ...manager, role: "staff" };
    expect(
      (await deleteMovement(req("DELETE", `/api/inventory/movements/${movement.id}`), ctx(movement.id))).status,
    ).toBe(403);
    session.user = manager;
    expect(
      (await deleteMovement(req("DELETE", `/api/inventory/movements/${movement.id}`), ctx(movement.id))).status,
    ).toBe(204);
  });
});

describe("supplier and bank routes", () => {
  it("list banks, name an account, add, edit and delete a supplier; staff can't", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    vi.stubEnv("PAYSTACK_SIMULATE", "1");
    const manager = await signInAs("manager");
    expect((await (await listBanks()).json()).length).toBeGreaterThan(10);
    const named = await resolveBank(req("GET", "/api/banks/resolve?accountNumber=0123456781&bankCode=058"));
    expect(await named.json()).toMatchObject({ accountName: "CHIOMA EZE" });
    expect((await resolveBank(req("GET", "/api/banks/resolve?accountNumber=0000000000&bankCode=058"))).status).toBe(
      400,
    );

    const created = await createSupplier(
      req("POST", "/api/suppliers", {
        name: "Amo Byng",
        supplies: ["chicks"],
        bank: { bankCode: "058", accountNumber: "0123456781" },
      }),
    );
    expect(created.status).toBe(201);
    const supplier = await created.json();
    expect(await (await listSuppliers()).json()).toHaveLength(1);
    const saved = await updateSupplier(
      req("PATCH", `/api/suppliers/${supplier.id}`, { name: "Amo Byng Ltd", version: supplier.version }),
      ctx(supplier.id),
    );
    expect((await saved.json()).name).toBe("Amo Byng Ltd");
    expect((await createSupplier(new Request(`${BASE}/api/suppliers`, { method: "POST", body: "{oops" }))).status).toBe(
      400,
    );
    expect(
      (
        await updateSupplier(
          new Request(`${BASE}/api/suppliers/${supplier.id}`, { method: "PATCH", body: "{oops" }),
          ctx(supplier.id),
        )
      ).status,
    ).toBe(400);

    session.user = { ...manager, role: "staff" };
    expect((await listSuppliers()).status).toBe(403);
    expect((await listBanks()).status).toBe(403);
    session.user = manager;
    expect((await deleteSupplier(req("DELETE", `/api/suppliers/${supplier.id}`), ctx(supplier.id))).status).toBe(204);
    vi.unstubAllEnvs();
  });
});

describe("expense, payment and upload routes", () => {
  it("record, pay through Paystack (owners only), check, release an OTP, mark paid, edit and delete", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    vi.stubEnv("PAYSTACK_SIMULATE", "1");
    const { resetSimulator, configureSimulator } = await import("@/lib/paystack/simulator");
    resetSimulator();
    const owner = await signInAs("owner");
    const supplier = await (
      await createSupplier(
        req("POST", "/api/suppliers", { name: "Feed mill", bank: { bankCode: "058", accountNumber: "0123456781" } }),
      )
    ).json();
    const body = {
      category: "transport",
      amountKobo: 1_500_000,
      description: "Feed from Ibadan",
      supplierId: supplier.id,
      method: "later",
      requestId: "route-exp-0001",
    };
    const created = await createExpense(req("POST", "/api/expenses", body));
    expect(created.status).toBe(201);
    const expense = await created.json();
    expect((await createExpense(req("POST", "/api/expenses", body))).status).toBe(200);
    expect(await (await listExpenses(req("GET", `/api/expenses?supplierId=${supplier.id}`))).json()).toHaveLength(1);
    expect((await createExpense(new Request(`${BASE}/api/expenses`, { method: "POST", body: "{oops" }))).status).toBe(
      400,
    );

    session.user = { ...owner, role: "manager" };
    expect((await payExpense(req("POST", `/api/expenses/${expense.id}/pay`), ctx(expense.id))).status).toBe(403);
    expect((await payPreview(req("GET", `/api/expenses/${expense.id}/pay`), ctx(expense.id))).status).toBe(403);
    session.user = owner;
    expect(
      await (await payPreview(req("GET", `/api/expenses/${expense.id}/pay`), ctx(expense.id))).json(),
    ).toMatchObject({
      enough: true,
    });
    configureSimulator({ otp: true });
    const paid = await payExpense(req("POST", `/api/expenses/${expense.id}/pay`), ctx(expense.id));
    expect(paid.status).toBe(201);
    const payout = await paid.json();
    expect(payout.status).toBe("otp");
    expect(
      (
        await submitOtp(
          new Request(`${BASE}/api/payouts/${payout.id}/otp`, { method: "POST", body: "{oops" }),
          ctx(payout.id),
        )
      ).status,
    ).toBe(400);
    const released = await submitOtp(req("POST", `/api/payouts/${payout.id}/otp`, { otp: "123456" }), ctx(payout.id));
    expect((await released.json()).status).toBe("success");
    expect(
      await (await checkPayout(req("POST", `/api/payouts/${payout.id}/check`), ctx(payout.id))).json(),
    ).toMatchObject({ status: "success" });
    expect((await checkPayout(req("POST", "/api/payouts/nope/check"), ctx("nope"))).status).toBe(404);
    expect(
      await (await listPayouts(req("GET", `/api/expenses/${expense.id}/payouts`), ctx(expense.id))).json(),
    ).toHaveLength(1);

    const cash = await (
      await createExpense(req("POST", "/api/expenses", { ...body, requestId: undefined, supplierId: null }))
    ).json();
    expect(
      await (await markPaid(req("POST", `/api/expenses/${cash.id}/paid`, { method: "cash" }), ctx(cash.id))).json(),
    ).toMatchObject({
      paymentStatus: "paid",
    });
    expect(
      (
        await markPaid(
          new Request(`${BASE}/api/expenses/${cash.id}/paid`, { method: "POST", body: "{oops" }),
          ctx(cash.id),
        )
      ).status,
    ).toBe(409);
    const edited = await updateExpense(
      req("PATCH", `/api/expenses/${cash.id}`, { notes: "Okada", version: 1 }),
      ctx(cash.id),
    );
    expect((await edited.json()).notes).toBe("Okada");
    expect(
      (
        await updateExpense(
          new Request(`${BASE}/api/expenses/${cash.id}`, { method: "PATCH", body: "{oops" }),
          ctx(cash.id),
        )
      ).status,
    ).toBe(409);
    expect((await deleteExpense(req("DELETE", `/api/expenses/${cash.id}`), ctx(cash.id))).status).toBe(204);
    vi.unstubAllEnvs();
  });

  it("keeps a receipt and serves it back only to its farm", async () => {
    await signInAs("manager");
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "receipt.jpg", { type: "image/jpeg" }));
    const stored = await upload(new Request(`${BASE}/api/uploads`, { method: "POST", body: form }));
    expect(stored.status).toBe(201);
    const { url } = await stored.json();
    const id = url.split("/").pop();
    const served = await getUpload(req("GET", url), ctx(id));
    expect(served.headers.get("Content-Type")).toBe("image/jpeg");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect((await upload(new Request(`${BASE}/api/uploads`, { method: "POST", body: "nope" }))).status).toBe(400);
    await signInAs("owner");
    expect((await getUpload(req("GET", url), ctx(id))).status).toBe(404);
  });
});

describe("equipment routes", () => {
  it("add, list, edit, mark sold and delete; staff can't see it", async () => {
    const manager = await signInAs("manager");
    const body = {
      name: "Generator",
      kind: "generator",
      costKobo: 60_000_000,
      purchasedOn: "2026-01-10",
      usefulLifeMonths: 24,
    };
    const created = await createAsset(req("POST", "/api/assets", body));
    expect(created.status).toBe(201);
    const asset = await created.json();
    expect(await (await listAssets()).json()).toHaveLength(1);
    const saved = await updateAsset(
      req("PATCH", `/api/assets/${asset.id}`, { ...body, notes: "Shed", version: 0 }),
      ctx(asset.id),
    );
    expect((await saved.json()).notes).toBe("Shed");
    expect((await createAsset(new Request(`${BASE}/api/assets`, { method: "POST", body: "{oops" }))).status).toBe(400);
    expect(
      (
        await updateAsset(
          new Request(`${BASE}/api/assets/${asset.id}`, { method: "PATCH", body: "{oops" }),
          ctx(asset.id),
        )
      ).status,
    ).toBe(409); // No version: refused as stale.
    expect(
      (
        await disposeAsset(
          new Request(`${BASE}/api/assets/${asset.id}/dispose`, { method: "POST", body: "{oops" }),
          ctx(asset.id),
        )
      ).status,
    ).toBe(400);
    const sold = await disposeAsset(
      req("POST", `/api/assets/${asset.id}/dispose`, { status: "scrapped" }),
      ctx(asset.id),
    );
    expect((await sold.json()).status).toBe("scrapped");
    session.user = { ...manager, role: "staff" };
    expect((await listAssets()).status).toBe(403);
    session.user = manager;
    expect((await deleteAsset(req("DELETE", `/api/assets/${asset.id}`), ctx(asset.id))).status).toBe(204);
  });
});

const keyed = (key: string) => ({ params: Promise.resolve({ key }) });

describe("expense category routes", () => {
  it("list, add and rename; managers can read but not change budgets", async () => {
    const owner = await signInAs("owner");
    expect(await (await listCategories()).json()).toHaveLength(12);
    const created = await createCategory(
      req("POST", "/api/expense-categories", { name: "Security", monthlyBudgetKobo: 100 }),
    );
    expect(created.status).toBe(201);
    expect((await created.json()).some((c: { name: string }) => c.name === "Security")).toBe(true);
    const renamed = await updateCategory(
      req("PATCH", "/api/expense-categories/rent", { name: "Land rent" }),
      keyed("rent"),
    );
    expect((await renamed.json()).find((c: { key: string }) => c.key === "rent").name).toBe("Land rent");
    expect(
      (await createCategory(new Request(`${BASE}/api/expense-categories`, { method: "POST", body: "{oops" }))).status,
    ).toBe(400);
    expect(
      (
        await updateCategory(
          new Request(`${BASE}/api/expense-categories/rent`, { method: "PATCH", body: "{oops" }),
          keyed("rent"),
        )
      ).status,
    ).toBe(400);
    session.user = { ...owner, role: "manager" };
    expect((await listCategories()).status).toBe(200);
    expect((await createCategory(req("POST", "/api/expense-categories", { name: "X" }))).status).toBe(403);
  });
});

describe("approval routes", () => {
  it("only owners approve or reject", async () => {
    const owner = await signInAs("owner");
    session.user = { ...owner, role: "manager" };
    const body = { category: "repairs", amountKobo: 25_000_000, description: "Pump", method: "later" };
    const first = await (await createExpense(req("POST", "/api/expenses", body))).json();
    const second = await (await createExpense(req("POST", "/api/expenses", body))).json();
    expect(first.approval).toBe("pending");
    expect((await approveExpense(req("POST", `/api/expenses/${first.id}/approve`), ctx(first.id))).status).toBe(403);
    session.user = owner;
    expect(
      (await (await approveExpense(req("POST", `/api/expenses/${first.id}/approve`), ctx(first.id))).json()).approval,
    ).toBe("approved");
    expect(
      (
        await rejectExpense(
          new Request(`${BASE}/api/expenses/${second.id}/reject`, { method: "POST", body: "{oops" }),
          ctx(second.id),
        )
      ).status,
    ).toBe(400);
    const rejected = await rejectExpense(
      req("POST", `/api/expenses/${second.id}/reject`, { reason: "Wrong price" }),
      ctx(second.id),
    );
    expect((await rejected.json()).approval).toBe("rejected");
  });
});

describe("repeat routes", () => {
  it("list and change repeats; staff can't", async () => {
    const manager = await signInAs("manager");
    await createExpense(
      req("POST", "/api/expenses", {
        category: "rent",
        amountKobo: 5_000_000,
        description: "Rent",
        method: "cash",
        repeat: true,
      }),
    );
    const [repeat] = await (await listRecurring()).json();
    expect(repeat.description).toBe("Rent");
    const saved = await updateRecurring(req("PATCH", `/api/recurring/${repeat.id}`, { active: false }), ctx(repeat.id));
    expect((await saved.json()).active).toBe(false);
    expect(
      (
        await updateRecurring(
          new Request(`${BASE}/api/recurring/${repeat.id}`, { method: "PATCH", body: "{oops" }),
          ctx(repeat.id),
        )
      ).status,
    ).toBe(200);
    session.user = { ...manager, role: "staff" };
    expect((await listRecurring()).status).toBe(403);
  });
});
