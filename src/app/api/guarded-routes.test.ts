import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE as deleteBatch, PATCH as updateBatch } from "./batches/[id]/route";
import { POST as batchStatus } from "./batches/[id]/status/route";
import { POST as createBatch } from "./batches/route";
import { GET as outbox } from "./dev/outbox/route";
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
