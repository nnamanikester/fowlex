import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE as deleteBatch, PATCH as updateBatch } from "./batches/[id]/route";
import { POST as batchStatus } from "./batches/[id]/status/route";
import { POST as createBatch } from "./batches/route";
import { GET as outbox } from "./dev/outbox/route";
import { POST as recordChicks } from "./batches/[id]/chicks/route";
import { POST as closeBatch } from "./batches/[id]/close/route";
import { POST as pickUp } from "./batches/[id]/pickup/route";
import { DELETE as deleteEmployee, PATCH as updateEmployee } from "./employees/[id]/route";
import { POST as employeeStatus } from "./employees/[id]/status/route";
import { GET as listEmployees, POST as createEmployee } from "./employees/route";
import { GET as attendanceDay, POST as saveAttendance } from "./attendance/route";
import { DELETE as deleteAdvance } from "./advances/[id]/route";
import { GET as listAdvances, POST as createAdvance } from "./advances/route";
import { POST as approveRun } from "./payroll/[id]/approve/route";
import { PATCH as adjustLine } from "./payroll/[id]/lines/[employeeId]/route";
import { POST as payRun } from "./payroll/[id]/pay/route";
import { POST as reopenRun } from "./payroll/[id]/reopen/route";
import { DELETE as deleteRun, GET as getRun } from "./payroll/[id]/route";
import { GET as listRuns, POST as startRun } from "./payroll/route";
import { POST as emailPayslip } from "./payroll/[id]/payslips/email/route";
import { GET as payslips } from "./payroll/[id]/payslips/route";
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
import { GET as balance } from "./balance/route";
import { POST as syncBalanceRoute } from "./balance/sync/route";
import { POST as testMoney } from "./balance/test-money/route";
import { PATCH as saveTopUpRoute } from "./balance/top-up/route";
import { GET as balanceCron } from "./cron/balance/route";
import { DELETE as deleteCustomer, GET as getCustomer, PATCH as updateCustomer } from "./customers/[id]/route";
import { POST as customerStatus } from "./customers/[id]/status/route";
import { GET as listCustomers, POST as createCustomer } from "./customers/route";
import { DELETE as deleteTemplate } from "./contract-templates/[id]/route";
import { GET as listTemplates, POST as createTemplate } from "./contract-templates/route";
import { POST as activateContract } from "./contracts/[id]/activate/route";
import { POST as endContract } from "./contracts/[id]/end/route";
import { DELETE as deleteContract, PATCH as updateContract } from "./contracts/[id]/route";
import { GET as listContracts, POST as createContract } from "./contracts/route";
import { GET as contractsCron } from "./cron/contracts/route";
import { POST as cancelOrder } from "./sales/[id]/cancel/route";
import { POST as deliverOrder } from "./sales/[id]/deliver/route";
import { PATCH as updateOrder } from "./sales/[id]/route";
import { GET as salesQuote } from "./sales/quote/route";
import { GET as listOrders, POST as createOrder } from "./sales/route";
import { GET as invoicePdf } from "./invoices/[id]/pdf/route";
import { GET as getInvoice, PATCH as updateInvoice } from "./invoices/[id]/route";
import { POST as sendInvoice } from "./invoices/[id]/send/route";
import { POST as voidInvoice } from "./invoices/[id]/void/route";
import { GET as listInvoices, POST as createInvoice } from "./invoices/route";
import { GET as listInvoicePayments, POST as recordPayment } from "./invoices/[id]/payments/route";
import { DELETE as removePayment } from "./payments/[id]/route";
import { POST as emailStatement } from "./customers/[id]/statement/email/route";
import { GET as statementPdf } from "./customers/[id]/statement/pdf/route";
import { GET as statement } from "./customers/[id]/statement/route";
import { GET as agingRoute } from "./invoices/aging/route";
import { POST as inviteCustomer } from "./customers/[id]/invite/route";
import { GET as portalInvoicePdf } from "./portal/invoices/[id]/pdf/route";
import { GET as portalInvoice } from "./portal/invoices/[id]/route";
import { GET as portalHome } from "./portal/route";
import { GET as portalStatement } from "./portal/statement/route";
import { POST as placePublicOrder } from "./public/shop/[slug]/orders/route";
import { GET as publicOffer } from "./public/shop/[slug]/route";
import { GET as getShop, PATCH as updateShopRoute } from "./shop/route";
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

describe("bank routes for everyone who keeps a bank account", () => {
  it("finance can list banks and name an account to pay; sales can't", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    vi.stubEnv("PAYSTACK_SIMULATE", "1");
    await signInAs("finance");
    const banks = await (await listBanks()).json();
    expect(banks[0]).toEqual({ code: "001", name: "Test Bank (test mode only)", test: true });
    const named = await resolveBank(req("GET", "/api/banks/resolve?accountNumber=0000000000&bankCode=001"));
    expect(await named.json()).toMatchObject({ accountName: "TEST ACCOUNT" });
    await signInAs("sales");
    expect((await listBanks()).status).toBe(403);
    expect((await resolveBank(req("GET", "/api/banks/resolve"))).status).toBe(403);
    vi.unstubAllEnvs();
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

describe("batch chicks route", () => {
  it("records an older batch's chicks once; staff can't", async () => {
    const owner = await signInAs("owner");
    const house = await (await createHouse(req("POST", "/api/houses", { name: "House 1", capacity: 5000 }))).json();
    const batch = await (
      await createBatch(
        req("POST", "/api/batches", {
          houseId: house.id,
          placedOn: "2026-11-01",
          breed: "Ross 308",
          delivered: 100,
          pricePerChickKobo: 0,
          targetSellAgeDays: 42,
          targetWeightGrams: 2200,
          confirm: true,
        }),
      )
    ).json();
    // Free chicks: nothing recorded, so a price set later can be recorded by hand.
    const { BatchModel } = await import("@/models/batch");
    await BatchModel.updateOne({ _id: batch.id }, { pricePerChickKobo: 50_000 });
    const recorded = await recordChicks(
      req("POST", `/api/batches/${batch.id}/chicks`, { paidBy: "cash" }),
      ctx(batch.id),
    );
    expect(recorded.status).toBe(201);
    expect((await recorded.json()).chickExpense.paymentStatus).toBe("paid");
    expect(
      (
        await recordChicks(
          new Request(`${BASE}/api/batches/${batch.id}/chicks`, { method: "POST", body: "{oops" }),
          ctx(batch.id),
        )
      ).status,
    ).toBe(409);
    session.user = { ...owner, role: "staff" };
    expect((await recordChicks(req("POST", `/api/batches/${batch.id}/chicks`, {}), ctx(batch.id))).status).toBe(403);
  });
});

describe("pickup route", () => {
  it("places booked chicks; staff can't", async () => {
    const owner = await signInAs("owner");
    const house = await (await createHouse(req("POST", "/api/houses", { name: "House 1", capacity: 5000 }))).json();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
    const batch = await (
      await createBatch(
        req("POST", "/api/batches", {
          booking: true,
          houseId: house.id,
          placedOn: today,
          breed: "Ross 308",
          delivered: 100,
          pricePerChickKobo: 50_000,
          targetSellAgeDays: 42,
          targetWeightGrams: 2200,
        }),
      )
    ).json();
    expect(batch.phase).toBe("planned");
    session.user = { ...owner, role: "staff" };
    expect((await pickUp(req("POST", `/api/batches/${batch.id}/pickup`, { version: 0 }), ctx(batch.id))).status).toBe(
      403,
    );
    session.user = owner;
    expect(
      (
        await pickUp(
          new Request(`${BASE}/api/batches/${batch.id}/pickup`, { method: "POST", body: "{oops" }),
          ctx(batch.id),
        )
      ).status,
    ).toBe(409);
    const placed = await pickUp(
      req("POST", `/api/batches/${batch.id}/pickup`, { version: 0, delivered: 98, confirm: true }),
      ctx(batch.id),
    );
    expect(await placed.json()).toMatchObject({ phase: "active", shortfall: 2 });
  });
});

describe("employee routes", () => {
  it("add, edit, mark as left and remove someone; staff can't", async () => {
    await signInAs("manager");
    const created = await createEmployee(
      req("POST", "/api/employees", { name: "Musa", payType: "daily", rateKobo: 400_000 }),
    );
    expect(created.status).toBe(201);
    const musa = await created.json();
    expect((await createEmployee(new Request(`${BASE}/api/employees`, { method: "POST", body: "{oops" }))).status).toBe(
      400,
    );
    const edited = await updateEmployee(
      req("PATCH", `/api/employees/${musa.id}`, {
        name: "Musa Bello",
        payType: "daily",
        rateKobo: 450_000,
        version: 0,
      }),
      ctx(musa.id),
    );
    expect(await edited.json()).toMatchObject({ name: "Musa Bello", rateKobo: 450_000 });
    expect(
      (
        await updateEmployee(
          new Request(`${BASE}/api/employees/${musa.id}`, { method: "PATCH", body: "{oops" }),
          ctx(musa.id),
        )
      ).status,
    ).toBe(400);
    const left = await employeeStatus(
      req("POST", `/api/employees/${musa.id}/status`, { status: "left" }),
      ctx(musa.id),
    );
    expect((await left.json()).status).toBe("left");
    expect(
      (
        await employeeStatus(
          new Request(`${BASE}/api/employees/${musa.id}/status`, { method: "POST", body: "{oops" }),
          ctx(musa.id),
        )
      ).status,
    ).toBe(400);
    expect(await (await listEmployees()).json()).toMatchObject([{ id: musa.id }]);
    expect((await deleteEmployee(req("DELETE", `/api/employees/${musa.id}`), ctx(musa.id))).status).toBe(204);
    await signInAs("staff");
    expect((await listEmployees()).status).toBe(403);
    expect((await createEmployee(req("POST", "/api/employees", {}))).status).toBe(403);
  });
});

describe("attendance routes", () => {
  it("reads and saves a day; staff can't", async () => {
    await signInAs("manager");
    const musa = await (
      await createEmployee(req("POST", "/api/employees", { name: "Musa", payType: "daily", rateKobo: 400_000 }))
    ).json();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
    const saved = await saveAttendance(
      req("POST", "/api/attendance", { date: today, entries: [{ employeeId: musa.id, status: "present" }] }),
    );
    expect(await saved.json()).toMatchObject([{ employeeId: musa.id, status: "present" }]);
    expect(await (await attendanceDay(req("GET", `/api/attendance?date=${today}`))).json()).toMatchObject([
      { status: "present" },
    ]);
    expect(await (await attendanceDay(req("GET", "/api/attendance"))).json()).toEqual([]);
    expect(
      (await saveAttendance(new Request(`${BASE}/api/attendance`, { method: "POST", body: "{oops" }))).status,
    ).toBe(400);
    await signInAs("staff");
    expect((await attendanceDay(req("GET", "/api/attendance"))).status).toBe(403);
    expect((await saveAttendance(req("POST", "/api/attendance", {}))).status).toBe(403);
  });
});

describe("advance routes", () => {
  it("give, list and remove an advance; staff can't", async () => {
    await signInAs("owner");
    const musa = await (
      await createEmployee(req("POST", "/api/employees", { name: "Musa", payType: "monthly", rateKobo: 6_000_000 }))
    ).json();
    const given = await createAdvance(req("POST", "/api/advances", { employeeId: musa.id, amountKobo: 1_000_000 }));
    expect(given.status).toBe(201);
    const advance = await given.json();
    expect(await (await listAdvances(req("GET", `/api/advances?employeeId=${musa.id}`))).json()).toMatchObject([
      { id: advance.id },
    ]);
    expect(await (await listAdvances(req("GET", "/api/advances"))).json()).toHaveLength(1);
    expect((await createAdvance(new Request(`${BASE}/api/advances`, { method: "POST", body: "{oops" }))).status).toBe(
      400,
    );
    expect((await deleteAdvance(req("DELETE", `/api/advances/${advance.id}`), ctx(advance.id))).status).toBe(204);
    await signInAs("staff");
    expect((await listAdvances(req("GET", "/api/advances"))).status).toBe(403);
    expect((await createAdvance(req("POST", "/api/advances", {}))).status).toBe(403);
  });
});

describe("payroll routes", () => {
  it("managers prepare, owners approve, reopen and pay; staff can't", async () => {
    const owner = await signInAs("owner");
    const musa = await (
      await createEmployee(req("POST", "/api/employees", { name: "Musa", payType: "monthly", rateKobo: 6_000_000 }))
    ).json();
    session.user = { ...owner, role: "manager" };
    const started = await startRun(req("POST", "/api/payroll", {}));
    expect(started.status).toBe(201);
    const run = await started.json();
    const lines = (employeeId: string) => ({ params: Promise.resolve({ id: run.id, employeeId }) });
    const adjusted = await adjustLine(
      req("PATCH", `/api/payroll/${run.id}/lines/${musa.id}`, { bonusKobo: 100_000, version: 0 }),
      lines(musa.id),
    );
    expect((await adjusted.json()).lines[0].bonusKobo).toBe(100_000);
    expect(
      (await adjustLine(new Request(`${BASE}/x`, { method: "PATCH", body: "{oops" }), lines(musa.id))).status,
    ).toBe(409);
    expect((await approveRun(req("POST", `/api/payroll/${run.id}/approve`, { version: 1 }), ctx(run.id))).status).toBe(
      403,
    );
    expect((await payRun(req("POST", `/api/payroll/${run.id}/pay`), ctx(run.id))).status).toBe(403);
    session.user = owner;
    expect((await approveRun(new Request(`${BASE}/x`, { method: "POST", body: "{oops" }), ctx(run.id))).status).toBe(
      409,
    );
    const approved = await approveRun(req("POST", `/api/payroll/${run.id}/approve`, { version: 1 }), ctx(run.id));
    expect((await approved.json()).status).toBe("approved");
    expect((await (await payRun(req("POST", `/api/payroll/${run.id}/pay`), ctx(run.id))).json()).results).toEqual([]);
    expect((await (await reopenRun(req("POST", `/api/payroll/${run.id}/reopen`), ctx(run.id))).json()).status).toBe(
      "draft",
    );
    expect((await (await getRun(req("GET", `/api/payroll/${run.id}`), ctx(run.id))).json()).id).toBe(run.id);
    expect((await getRun(req("GET", "/api/payroll/x"), ctx(String(new Types.ObjectId())))).status).toBe(404);
    expect(await (await listRuns()).json()).toHaveLength(1);
    expect((await deleteRun(req("DELETE", `/api/payroll/${run.id}`), ctx(run.id))).status).toBe(204);
    expect((await startRun(new Request(`${BASE}/api/payroll`, { method: "POST", body: "{oops" }))).status).toBe(201);
    session.user = { ...owner, role: "staff" };
    expect((await listRuns()).status).toBe(403);
    expect((await startRun(req("POST", "/api/payroll", {}))).status).toBe(403);
  });
});

describe("payslip routes", () => {
  it("download a month's payslips or one, and email one; staff can't", async () => {
    await signInAs("owner");
    await createEmployee(
      req("POST", "/api/employees", { name: "Musa", email: "musa@f.com", payType: "monthly", rateKobo: 6_000_000 }),
    );
    const run = await (await startRun(req("POST", "/api/payroll", {}))).json();
    const approved = await (
      await approveRun(req("POST", `/api/payroll/${run.id}/approve`, { version: 0 }), ctx(run.id))
    ).json();
    const all = await payslips(req("GET", `/api/payroll/${run.id}/payslips`), ctx(run.id));
    expect(all.headers.get("Content-Type")).toBe("application/pdf");
    expect(all.headers.get("Content-Disposition")).toMatch(/^attachment; filename="Payslips \d{4}-\d{2}\.pdf"$/);
    const one = await payslips(req("GET", `/api/payroll/${run.id}/payslips?line=${approved.lines[0].id}`), ctx(run.id));
    expect(one.headers.get("Content-Disposition")).toMatch(/Payslip \d{4}-\d{2} Musa\.pdf/);
    const sent = await emailPayslip(
      req("POST", `/api/payroll/${run.id}/payslips/email`, { lineId: approved.lines[0].id }),
      ctx(run.id),
    );
    expect(await sent.json()).toEqual({ to: "musa@f.com" });
    expect((await emailPayslip(new Request(`${BASE}/x`, { method: "POST", body: "{oops" }), ctx(run.id))).status).toBe(
      404,
    );
    await signInAs("staff");
    expect((await payslips(req("GET", `/api/payroll/${run.id}/payslips`), ctx(run.id))).status).toBe(403);
    expect((await emailPayslip(req("POST", "/x", {}), ctx(run.id))).status).toBe(403);
  });
});

describe("Paystack balance routes", () => {
  it("open the book, fund it with test money, keep the top-up account; staff can't, the cron needs its secret", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    vi.stubEnv("PAYSTACK_SIMULATE", "1");
    await signInAs("owner");
    expect((await (await syncBalanceRoute()).json()).opened).toBe(true);
    const funded = await testMoney(req("POST", "/api/balance/test-money", { amountKobo: 500_000 }));
    expect(funded.status).toBe(201);
    expect((await funded.json()).summary.differenceKobo).toBe(0);
    expect((await testMoney(new Request(`${BASE}/x`, { method: "POST", body: "{oops" }))).status).toBe(400);
    const topUp = await saveTopUpRoute(
      req("PATCH", "/api/balance/top-up", {
        bankName: "Wema Bank",
        accountNumber: "0123456789",
        accountName: "Fowlex",
      }),
    );
    expect(await topUp.json()).toEqual({ bankName: "Wema Bank", accountNumber: "0123456789", accountName: "Fowlex" });
    expect((await saveTopUpRoute(new Request(`${BASE}/x`, { method: "PATCH", body: "{oops" }))).status).toBe(400);
    const book = await (await balance()).json();
    expect(book.entries.map((e: { category: string }) => e.category)).toEqual(["funding", "opening"]);
    expect(book.summary.topUp.accountNumber).toBe("0123456789");

    await signInAs("staff");
    expect((await balance()).status).toBe(403);
    expect((await syncBalanceRoute()).status).toBe(403);
    expect((await testMoney(req("POST", "/x", {}))).status).toBe(403);
    await signInAs("manager");
    expect((await saveTopUpRoute(req("PATCH", "/x", {}))).status).toBe(403);
    expect((await balance()).status).toBe(200);

    expect((await balanceCron(new Request(`${BASE}/api/cron/balance`))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s3cret");
    const cron = await balanceCron(
      new Request(`${BASE}/api/cron/balance`, { headers: { authorization: "Bearer s3cret" } }),
    );
    expect(await cron.json()).toEqual({ synced: 1 });
    vi.unstubAllEnvs();
  });
});

describe("customer routes", () => {
  it("add, read, edit, archive and delete a customer; staff can't, finance only reads", async () => {
    await signInAs("sales");
    const created = await createCustomer(req("POST", "/api/customers", { name: "Grill", type: "lounge" }));
    expect(created.status).toBe(201);
    const c = await created.json();
    expect((await (await listCustomers()).json()).map((x: { id: string }) => x.id)).toEqual([c.id]);
    expect((await (await getCustomer(req("GET", "/x"), ctx(c.id))).json()).name).toBe("Grill");
    expect((await getCustomer(req("GET", "/x"), ctx("nope"))).status).toBe(404);
    const saved = await updateCustomer(
      req("PATCH", "/x", { name: "Grill", type: "lounge", termsDays: 30, version: c.version }),
      ctx(c.id),
    );
    expect((await saved.json()).termsDays).toBe(30);
    expect((await (await customerStatus(req("POST", "/x", { status: "archived" }), ctx(c.id))).json()).status).toBe(
      "archived",
    );
    expect((await createCustomer(new Request(`${BASE}/x`, { method: "POST", body: "{oops" }))).status).toBe(400);
    expect((await deleteCustomer(req("DELETE", "/x"), ctx(c.id))).status).toBe(204);

    await signInAs("finance");
    expect((await listCustomers()).status).toBe(200);
    expect((await createCustomer(req("POST", "/x", {}))).status).toBe(403);
    await signInAs("staff");
    expect((await listCustomers()).status).toBe(403);
    expect((await updateCustomer(req("PATCH", "/x", {}), ctx("x"))).status).toBe(403);
    expect((await customerStatus(req("POST", "/x", {}), ctx("x"))).status).toBe(403);
  });
});

describe("contract routes", () => {
  it("write, activate, change, end and delete contracts and templates; finance reads, staff can't", async () => {
    await signInAs("sales");
    const customer = await (await createCustomer(req("POST", "/x", { name: "Grill", type: "lounge" }))).json();
    const terms = {
      customerId: customer.id,
      pricing: "perBird",
      priceKobo: 850_000,
      deliveryEvery: "weekly",
      termsDays: 7,
      startDate: "2026-11-01",
      endDate: "2027-10-31",
    };
    const draft = await (await createContract(req("POST", "/x", terms))).json();
    expect(draft.status).toBe("draft");
    const active = await (await activateContract(req("POST", "/x"), ctx(draft.id))).json();
    expect(active.status).toBe("active");
    const changed = await updateContract(
      req("PATCH", "/x", { ...terms, priceKobo: 900_000, version: active.version }),
      ctx(draft.id),
    );
    expect((await changed.json()).priceKobo).toBe(900_000);
    expect((await (await endContract(req("POST", "/x", {}), ctx(draft.id))).json()).status).toBe("terminated");
    expect(await (await listContracts(req("GET", `/api/contracts?customerId=${customer.id}`))).json()).toHaveLength(1);
    const other = await (
      await createContract(req("POST", "/x", { ...terms, startDate: "2027-11-01", endDate: "2028-10-31" }))
    ).json();
    expect((await deleteContract(req("DELETE", "/x"), ctx(other.id))).status).toBe(204);
    const t = await createTemplate(req("POST", "/x", { ...terms, name: "Weekly birds", months: 6 }));
    expect(t.status).toBe(201);
    expect(await (await listTemplates()).json()).toHaveLength(1);
    expect((await deleteTemplate(req("DELETE", "/x"), ctx((await t.json()).id))).status).toBe(204);
    for (const bad of [createContract, createTemplate])
      expect((await bad(new Request(`${BASE}/x`, { method: "POST", body: "{oops" }))).status).toBe(400);

    await signInAs("finance");
    expect((await listContracts(req("GET", "/api/contracts"))).status).toBe(200);
    expect((await createContract(req("POST", "/x", {}))).status).toBe(403);
    await signInAs("staff");
    expect((await listContracts(req("GET", "/api/contracts"))).status).toBe(403);
    expect((await activateContract(req("POST", "/x"), ctx("x"))).status).toBe(403);

    expect((await contractsCron(new Request(`${BASE}/api/cron/contracts`))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s3cret");
    const cron = await contractsCron(
      new Request(`${BASE}/api/cron/contracts`, { headers: { authorization: "Bearer s3cret" } }),
    );
    expect(await cron.json()).toEqual({ warned: 0 });
    vi.unstubAllEnvs();
  });

  it("lets sales attach a signed contract", async () => {
    await signInAs("sales");
    const form = new FormData();
    form.set("file", new File([new Uint8Array([37, 80, 68, 70])], "signed.pdf", { type: "application/pdf" }));
    const stored = await upload(new Request(`${BASE}/api/uploads`, { method: "POST", body: form }));
    expect(stored.status).toBe(201);
  });
});

describe("sales order routes", () => {
  it("quote, book, change, deliver and cancel orders; finance reads, staff can't", async () => {
    // The owner both sets up houses and batches and sells.
    await signInAs("owner");
    const house = await (await createHouse(req("POST", "/api/houses", { name: "House 1", capacity: 5000 }))).json();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
    const placed = new Date(Date.parse(today) - 30 * 86_400_000).toISOString().slice(0, 10);
    const batch = await (
      await createBatch(
        req("POST", "/api/batches", {
          houseId: house.id,
          placedOn: placed,
          breed: "Ross 308",
          delivered: 500,
          pricePerChickKobo: 85_000,
          targetSellAgeDays: 42,
          targetWeightGrams: 2200,
          confirm: true,
        }),
      )
    ).json();
    const customer = await (await createCustomer(req("POST", "/x", { name: "Grill", type: "lounge" }))).json();
    const q = await salesQuote(req("GET", `/api/sales/quote?customerId=${customer.id}&date=${today}`));
    expect(await q.json()).toMatchObject({ contract: null, owedKobo: 0 });
    const line = { batchId: batch.id, birds: 100, weightGrams: 0, priceKobo: 850_000, pricing: "perBird" };
    const body = { customerId: customer.id, deliveryDate: today, lines: [line], deliveryKobo: 0, notes: "" };
    const booked = await createOrder(req("POST", "/x", body));
    expect(booked.status).toBe(201);
    const o = await booked.json();
    const changed = await (
      await updateOrder(
        req("PATCH", "/x", { ...body, lines: [{ ...line, birds: 120 }], version: o.version }),
        ctx(o.id),
      )
    ).json();
    expect(changed.totalKobo).toBe(102_000_000);
    const done = await deliverOrder(req("POST", "/x", { version: changed.version }), ctx(o.id));
    expect((await done.json()).status).toBe("delivered");
    const other = await (await createOrder(req("POST", "/x", body))).json();
    expect((await (await cancelOrder(req("POST", "/x"), ctx(other.id))).json()).status).toBe("cancelled");
    expect(await (await listOrders(req("GET", `/api/sales?batchId=${batch.id}`))).json()).toHaveLength(2);
    expect((await createOrder(new Request(`${BASE}/x`, { method: "POST", body: "{oops" }))).status).toBe(400);

    await signInAs("finance");
    expect((await listOrders(req("GET", "/api/sales"))).status).toBe(200);
    expect((await createOrder(req("POST", "/x", {}))).status).toBe(403);
    await signInAs("staff");
    for (const r of [listOrders(req("GET", "/api/sales")), salesQuote(req("GET", "/api/sales/quote"))])
      expect((await r).status).toBe(403);
    expect((await deliverOrder(req("POST", "/x", {}), ctx("x"))).status).toBe(403);
  });
});

describe("invoice routes", () => {
  it("bill a delivered order, change, send, download and void it; finance reads, staff can't", async () => {
    await signInAs("owner");
    const house = await (await createHouse(req("POST", "/api/houses", { name: "House 1", capacity: 5000 }))).json();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
    const placed = new Date(Date.parse(today) - 30 * 86_400_000).toISOString().slice(0, 10);
    const batch = await (
      await createBatch(
        req("POST", "/api/batches", {
          houseId: house.id,
          placedOn: placed,
          breed: "Ross 308",
          delivered: 500,
          pricePerChickKobo: 85_000,
          targetSellAgeDays: 42,
          targetWeightGrams: 2200,
          confirm: true,
        }),
      )
    ).json();
    const customer = await (
      await createCustomer(req("POST", "/x", { name: "Grill", type: "lounge", email: "grill@f.com" }))
    ).json();
    const order = await (
      await createOrder(
        req("POST", "/x", {
          customerId: customer.id,
          deliveryDate: today,
          lines: [{ batchId: batch.id, birds: 10, weightGrams: 0, priceKobo: 850_000, pricing: "perBird" }],
        }),
      )
    ).json();
    await deliverOrder(req("POST", "/x", { version: order.version }), ctx(order.id));
    const made = await createInvoice(req("POST", "/x", { orderIds: [order.id] }));
    expect(made.status).toBe(201);
    const inv = await made.json();
    expect((await (await getInvoice(req("GET", "/x"), ctx(inv.id))).json()).number).toBe(inv.number);
    expect((await getInvoice(req("GET", "/x"), ctx("nope"))).status).toBe(404);
    const changed = await (
      await updateInvoice(req("PATCH", "/x", { discountKobo: 100, version: inv.version }), ctx(inv.id))
    ).json();
    expect(changed.totalKobo).toBe(8_499_900);
    expect((await (await sendInvoice(req("POST", "/x"), ctx(inv.id))).json()).state).toBe("sent");
    const pdf = await invoicePdf(req("GET", "/x"), ctx(inv.id));
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    const paid = await recordPayment(req("POST", "/x", { amountKobo: 100_000, method: "cash" }), ctx(inv.id));
    expect(paid.status).toBe(201);
    expect(await (await listInvoicePayments(req("GET", "/x"), ctx(inv.id))).json()).toHaveLength(1);
    expect((await removePayment(req("DELETE", "/x"), ctx((await paid.json()).id))).status).toBe(204);
    expect((await recordPayment(new Request(`${BASE}/x`, { method: "POST", body: "{oops" }), ctx(inv.id))).status).toBe(
      400,
    );
    expect((await (await voidInvoice(req("POST", "/x", { reason: "Mistake" }), ctx(inv.id))).json()).state).toBe(
      "void",
    );
    expect(await (await listInvoices(req("GET", `/api/invoices?customerId=${customer.id}`))).json()).toHaveLength(1);
    expect((await createInvoice(new Request(`${BASE}/x`, { method: "POST", body: "{oops" }))).status).toBe(400);

    await signInAs("finance");
    expect((await listInvoices(req("GET", "/api/invoices"))).status).toBe(200);
    expect((await createInvoice(req("POST", "/x", {}))).status).toBe(403);
    // Finance can record payments: refused here only because the invoice is on another farm.
    expect((await recordPayment(req("POST", "/x", { amountKobo: 1, method: "cash" }), ctx(inv.id))).status).toBe(404);
    await signInAs("staff");
    expect((await listInvoices(req("GET", "/api/invoices"))).status).toBe(403);
    expect((await invoicePdf(req("GET", "/x"), ctx("x"))).status).toBe(403);
    expect((await recordPayment(req("POST", "/x", {}), ctx("x"))).status).toBe(403);
    expect((await removePayment(req("DELETE", "/x"), ctx("x"))).status).toBe(403);
  });
});

describe("statement and aging routes", () => {
  it("show, download and email a statement and the aging; staff can't", async () => {
    await signInAs("finance");
    const owner = session.user!;
    session.user = { ...owner, role: "owner" };
    const customer = await (
      await createCustomer(req("POST", "/x", { name: "Grill", type: "lounge", email: "g@f.com" }))
    ).json();
    session.user = owner;
    const q = "from=2026-01-01&to=2026-12-31";
    const s = await statement(req("GET", `/api/customers/${customer.id}/statement?${q}`), ctx(customer.id));
    expect(await s.json()).toMatchObject({ openingKobo: 0, closingKobo: 0, entries: [] });
    const pdf = await statementPdf(req("GET", `/api/customers/${customer.id}/statement/pdf?${q}`), ctx(customer.id));
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(await (await agingRoute()).json()).toMatchObject({ totalKobo: 0, rows: [] });
    // Finance reads; emailing it is for those who send invoices.
    expect((await emailStatement(req("POST", "/x", { from: "2026-01-01" }), ctx(customer.id))).status).toBe(403);
    session.user = { ...owner, role: "sales" };
    const sent = await emailStatement(req("POST", "/x", { from: "2026-01-01" }), ctx(customer.id));
    expect(await sent.json()).toEqual({ to: "g@f.com" });
    expect(
      (await emailStatement(new Request(`${BASE}/x`, { method: "POST", body: "{oops" }), ctx(customer.id))).status,
    ).toBe(400);
    await signInAs("staff");
    expect((await statement(req("GET", "/x"), ctx("x"))).status).toBe(403);
    expect((await agingRoute()).status).toBe(403);
  });
});

describe("portal routes", () => {
  it("a customer sees their own invoices; another customer's is 404; staff can't use the portal", async () => {
    await signInAs("owner");
    const farmId = session.user!.farmId;
    const owner = session.user!;
    const mine = await (
      await createCustomer(req("POST", "/x", { name: "Grill", type: "lounge", email: "grill@f.com" }))
    ).json();
    const other = await (await createCustomer(req("POST", "/x", { name: "Suya", type: "restaurant" }))).json();
    const invited = await inviteCustomer(req("POST", "/x"), ctx(mine.id));
    expect((await invited.json()).invited).toBe(true);
    // Two invoices made by hand, one for each customer, both sent.
    const { InvoiceModel } = await import("@/models/invoice");
    const make = (customerId: string, number: string) =>
      InvoiceModel.create({
        farmId,
        number,
        customerId,
        lines: [{ description: "Birds", amountKobo: 100 }],
        issueDate: "2026-11-01",
        dueDate: "2026-11-15",
        subtotalKobo: 100,
        totalKobo: 100,
        state: "sent",
      });
    const a = await make(mine.id, "INV-2026-0901");
    const b = await make(other.id, "INV-2026-0902");
    const buyer = await UserModel.create({ farmId, email: "grill@f.com", name: "Grill", role: "customer" });
    const { CustomerModel } = await import("@/models/customer");
    await CustomerModel.updateOne({ _id: mine.id }, { $set: { userId: buyer._id } });
    session.user = { id: String(buyer._id), farmId, name: "Grill", email: "grill@f.com", role: "customer" };

    expect((await (await portalHome()).json()).invoices.map((i: { number: string }) => i.number)).toEqual([
      "INV-2026-0901",
    ]);
    expect((await (await portalInvoice(req("GET", "/x"), ctx(String(a._id)))).json()).invoice.number).toBe(
      "INV-2026-0901",
    );
    expect((await portalInvoice(req("GET", "/x"), ctx(String(b._id)))).status).toBe(404);
    expect((await portalInvoicePdf(req("GET", "/x"), ctx(String(b._id)))).status).toBe(404);
    expect((await portalInvoicePdf(req("GET", "/x"), ctx(String(a._id)))).headers.get("Content-Type")).toBe(
      "application/pdf",
    );
    const statement = await portalStatement(req("GET", "/api/portal/statement?from=2026-01-01"));
    expect(statement.headers.get("Content-Type")).toBe("application/pdf");

    session.user = { ...owner, role: "staff" };
    expect((await portalHome()).status).toBe(403);
    expect((await inviteCustomer(req("POST", "/x"), ctx(mine.id))).status).toBe(403);
  });
});

describe("order page routes", () => {
  it("sales turn the page on; anyone sees the offer and orders; staff can't change it", async () => {
    await signInAs("owner");
    const house = await (await createHouse(req("POST", "/api/houses", { name: "House 1", capacity: 5000 }))).json();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
    const placed = new Date(Date.parse(today) - 40 * 86_400_000).toISOString().slice(0, 10);
    await createBatch(
      req("POST", "/api/batches", {
        houseId: house.id,
        placedOn: placed,
        breed: "Ross 308",
        delivered: 200,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      }),
    );
    session.user = { ...session.user!, role: "sales" };
    expect((await (await getShop()).json()).enabled).toBe(false);
    const on = await (await updateShopRoute(req("PATCH", "/x", { enabled: true, pricePerKgKobo: 320_000 }))).json();
    expect(on.slug).toBe("fowlex-farms");
    expect((await updateShopRoute(new Request(`${BASE}/x`, { method: "PATCH", body: "{oops" }))).status).toBe(200);

    // The public side: no one is signed in.
    session.user = null;
    const slug = { params: Promise.resolve({ slug: "fowlex-farms" }) };
    expect((await (await publicOffer(req("GET", "/x"), slug)).json()).readyNow).toBe(200);
    expect((await publicOffer(req("GET", "/x"), { params: Promise.resolve({ slug: "nope" }) })).status).toBe(404);
    const order = await placePublicOrder(
      new Request(`${BASE}/x`, {
        method: "POST",
        headers: { "x-forwarded-for": "5.5.5.5, 10.0.0.1" },
        body: JSON.stringify({
          birds: 20,
          date: today,
          delivery: false,
          name: "Chidi",
          phone: "08031234567",
          email: "",
          business: "",
          address: "",
          notes: "",
        }),
      }),
      slug,
    );
    expect(order.status).toBe(201);
    expect((await order.json()).birds).toBe(20);
    expect((await placePublicOrder(new Request(`${BASE}/x`, { method: "POST", body: "{oops" }), slug)).status).toBe(
      400,
    );

    await signInAs("staff");
    expect((await getShop()).status).toBe(403);
    expect((await updateShopRoute(req("PATCH", "/x", {}))).status).toBe(403);
  });
});
