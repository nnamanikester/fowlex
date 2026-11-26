import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "./current-user";
import { apiRoute, HttpError, requirePermission, requireRole, requireSession } from "./guard";
import { currentActor } from "@/lib/audit/context";

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("./current-user", () => ({
  getSessionUser: async () => session.user,
  getCurrentUser: async () => session.user,
}));

const as = (role: CurrentUser["role"]): CurrentUser => ({
  id: "u1",
  farmId: "f1",
  name: "Ada",
  email: "a@f.com",
  role,
});
beforeEach(() => (session.user = null));

describe("guards", () => {
  it("requireSession: 401 when signed out", async () => {
    await expect(requireSession()).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
    session.user = as("staff");
    expect(await requireSession()).toEqual(as("staff"));
  });

  it("requireRole: only the roles named", async () => {
    session.user = as("staff");
    await expect(requireRole("owner", "manager")).rejects.toMatchObject({ status: 403, code: "forbidden" });
    session.user = as("manager");
    expect((await requireRole("owner", "manager")).role).toBe("manager");
  });

  it("requirePermission: follows the permission table", async () => {
    session.user = as("manager");
    await expect(requirePermission("settings.manage")).rejects.toMatchObject({ status: 403 });
    expect((await requirePermission("finance.read")).role).toBe("manager");
  });
});

describe("apiRoute", () => {
  it("turns a refusal into JSON with its status and field", async () => {
    const handler = apiRoute(async () => {
      throw new HttpError(400, "invalid_settings", "Use the 10-digit account number.", "accountNumber");
    });
    const response = await handler();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_settings", message: "Use the 10-digit account number.", field: "accountNumber" },
    });
  });

  it("passes other errors through, and answers normally otherwise", async () => {
    await expect(apiRoute(async () => Promise.reject(new Error("boom")))()).rejects.toThrow("boom");
    const ok = await apiRoute(async (n: number) => NextResponse.json({ n }))(7);
    expect(await ok.json()).toEqual({ n: 7 });
  });

  it("records the signed-in person as the actor for the request's changes", async () => {
    session.user = as("owner");
    let seen: unknown = "unset";
    await apiRoute(async () => {
      expect(currentActor()).toBeNull();
      await requireSession();
      seen = currentActor();
      return new Response(null);
    })();
    expect(seen).toEqual({ id: "u1", name: "Ada" });
    expect(currentActor()).toBeNull();
  });
});
