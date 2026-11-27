import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest, asProblem, authRequest, fallbackMessage, READ_TIMEOUT_MS } from "./client";

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

  it("gives up on a read that hangs, but lets a change finish", async () => {
    const fetch = vi.fn(async (_path: string, init: RequestInit) => {
      if (init.signal) throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(authRequest("/api/x", "GET")).rejects.toMatchObject({ status: 0, code: "timeout" });
    expect(await authRequest("/api/x", "POST", { a: 1 })).toEqual({ ok: true });
    expect(fetch.mock.calls[1][1].signal).toBeUndefined();
    expect(READ_TIMEOUT_MS).toBeGreaterThan(10_000);
  });

  it("puts each kind of failure without a message in plain words", async () => {
    vi.stubGlobal("fetch", respond(503, {}));
    await expect(authRequest("/api/x", "POST", {})).rejects.toMatchObject({
      status: 503,
      message: "Fowlex had a problem. Try again in a moment.",
    });
    expect(fallbackMessage(401)).toMatch(/signed out/);
    expect(fallbackMessage(403)).toMatch(/role/);
    expect(fallbackMessage(404)).toMatch(/couldn't find/);
    expect(fallbackMessage(409)).toMatch(/changed this/);
    expect(fallbackMessage(413)).toMatch(/too big/);
    expect(fallbackMessage(429)).toMatch(/Wait a minute/);
    expect(fallbackMessage(418)).toMatch(/Something went wrong/);
  });
});

describe("asProblem", () => {
  it("keeps an API error and puts anything else in words", () => {
    const error = { status: 400, code: "x", message: "No." };
    expect(asProblem(error)).toBe(error);
    expect(asProblem(new Error("boom"))).toMatchObject({ status: 0, code: "unknown" });
    expect(asProblem(undefined).message).toMatch(/Something went wrong/);
  });
});
