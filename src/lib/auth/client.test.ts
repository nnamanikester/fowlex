import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest, authRequest } from "./client";

const respond = (status: number, body?: unknown) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe("authRequest", () => {
  it("sends JSON and returns the answer", async () => {
    const fetch = respond(200, { name: "Ada" });
    vi.stubGlobal("fetch", fetch);
    expect(await authRequest("/api/auth/login", "POST", { email: "a" })).toEqual({ name: "Ada" });
    expect(fetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"email":"a"}',
    });
  });

  it("returns nothing for 204", async () => {
    vi.stubGlobal("fetch", respond(204));
    expect(await apiRequest("/api/auth/session", "DELETE")).toBeUndefined();
  });

  it("throws the server's error, with its field", async () => {
    vi.stubGlobal(
      "fetch",
      respond(400, { error: { code: "weak_password", message: "Too short.", field: "password" } }),
    );
    await expect(authRequest("/api/x", "POST", {})).rejects.toEqual({
      status: 400,
      code: "weak_password",
      message: "Too short.",
      field: "password",
    });
  });

  it("says something useful when the answer isn't JSON or the network is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 502 })),
    );
    await expect(authRequest("/api/x", "GET")).rejects.toMatchObject({ status: 502, code: "unknown" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(authRequest("/api/x", "GET")).rejects.toMatchObject({ status: 0, code: "network" });
  });
});
