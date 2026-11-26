import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { SESSION_COOKIE, signSession } from "@/lib/auth/jwt";
import type { Role } from "@/lib/auth/permissions";
import { config, proxy } from "@/proxy";

process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
const BASE = "https://app.fowlex.com";

async function visit(path: string, role?: Role) {
  const headers = new Headers();
  if (role) headers.set("cookie", `${SESSION_COOKIE}=${await signSession({ userId: "u1", sessionVersion: 0, role })}`);
  const response = await proxy(new NextRequest(`${BASE}${path}`, { headers }));
  return {
    status: response.status,
    location: response.headers.get("location")?.replace(BASE, ""),
    passes: response.headers.get("x-middleware-next") === "1",
    body: response.headers.get("content-type")?.includes("json") ? await response.json() : null,
  };
}

describe("proxy", () => {
  it("lets anyone reach sign-in, the design system and the auth APIs", async () => {
    for (const path of ["/auth/login", "/auth/forgot-password", "/design", "/api/auth/login", "/api/dev/outbox"])
      expect((await visit(path)).passes).toBe(true);
  });

  it("sends signed-out visitors to sign in, keeping where they were going", async () => {
    expect(await visit("/invoices?status=overdue")).toMatchObject({
      status: 307,
      location: "/auth/login?redirect=%2Finvoices%3Fstatus%3Doverdue",
    });
    expect((await visit("/")).location).toBe("/auth/login");
  });

  it("answers 401 for APIs without a session", async () => {
    expect(await visit("/api/reports/summary")).toMatchObject({
      status: 401,
      body: { error: { code: "unauthenticated" } },
    });
  });

  it("treats a forged cookie as no session", async () => {
    const response = await proxy(
      new NextRequest(`${BASE}/batches`, { headers: { cookie: `${SESSION_COOKIE}=forged.token.here` } }),
    );
    expect(response.headers.get("location")).toContain("/auth/login");
  });

  it("sends the signed-in away from the sign-in page to their home", async () => {
    expect((await visit("/auth/login", "owner")).location).toBe("/");
    expect((await visit("/auth/login", "staff")).location).toBe("/log");
    expect((await visit("/auth/login", "customer")).location).toBe("/portal");
  });

  it("keeps customers in the portal and everyone else out of it", async () => {
    expect((await visit("/portal", "customer")).passes).toBe(true);
    expect((await visit("/batches", "customer")).location).toBe("/portal");
    expect(await visit("/api/reports/summary", "customer")).toMatchObject({ status: 403 });
    expect((await visit("/portal", "owner")).location).toBe("/");
    expect(await visit("/api/portal/invoices", "manager")).toMatchObject({ status: 403 });
    expect((await visit("/batches", "staff")).passes).toBe(true);
  });

  it("doesn't run for Next's own files or public images", () => {
    const [matcher] = config.matcher;
    const runs = (path: string) =>
      new RegExp(`^${matcher.replace("/((?!", "/(?!(?:").replace(").*)", ")).*")}$`).test(path);
    expect(runs("/_next/static/chunk.js")).toBe(false);
    expect(runs("/brand/fowlex-icon-color.svg")).toBe(false);
    expect(runs("/icon.png")).toBe(false);
    expect(runs("/batches")).toBe(true);
    expect(runs("/api/auth/login")).toBe(true);
  });
});
