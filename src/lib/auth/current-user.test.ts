import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser, requireUser } from "./current-user";
import { SESSION_COOKIE, signSession } from "./jwt";
import { FarmModel } from "@/models/farm";
import { UserModel } from "@/models/user";
import { setupTestDb } from "@/test/db";

// The request's cookies, and redirect() as Next throws it.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}));
const cacheLife = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ cacheLife }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

setupTestDb();
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
beforeEach(() => jar.clear());

async function signedIn(overrides: Record<string, unknown> = {}) {
  const farm = await FarmModel.create({ name: "Fowlex Farms" });
  const user = await UserModel.create({
    farmId: farm._id,
    email: "ada@fowlex.com",
    name: "Ada",
    role: "manager",
    ...overrides,
  });
  jar.set(SESSION_COOKIE, await signSession({ userId: user.id, sessionVersion: user.sessionVersion, role: "manager" }));
  return user;
}

describe("getCurrentUser", () => {
  it("is null without a session cookie, or with a forged one", async () => {
    expect(await getCurrentUser()).toBeNull();
    jar.set(SESSION_COOKIE, "not-a-token");
    expect(await getCurrentUser()).toBeNull();
  });

  it("is the signed-in person, without secrets", async () => {
    const user = await signedIn();
    expect(await getCurrentUser()).toEqual({
      id: user.id,
      farmId: String(user.farmId),
      name: "Ada",
      email: "ada@fowlex.com",
      role: "manager",
    });
  });

  it("ends at once when the account is turned off or the session version moves on", async () => {
    const user = await signedIn();
    await UserModel.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    expect(await getCurrentUser()).toBeNull();

    jar.clear();
    await UserModel.deleteMany({});
    await signedIn({ status: "disabled" });
    expect(await getCurrentUser()).toBeNull();
  });

  it("is null for a user who no longer exists", async () => {
    const user = await signedIn();
    await UserModel.deleteOne({ _id: user._id });
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("requireUser", () => {
  it("returns the user, or redirects through the route that clears the cookie", async () => {
    await expect(requireUser()).rejects.toThrow("REDIRECT /api/auth/session/expired");
    await signedIn();
    expect((await requireUser()).name).toBe("Ada");
  });
});

describe("in production", () => {
  it("uses the private-cached lookup with the session profile, with the same answer", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { getCurrentUser: production } = await import("./current-user");
    const user = await signedIn();
    expect((await production())?.id).toBe(user.id);
    expect(cacheLife).toHaveBeenCalledWith("session");
    vi.unstubAllEnvs();
  });
});
