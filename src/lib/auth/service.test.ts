import { describe, expect, it } from "vitest";

import { hashPassword } from "./hash";
import { verifySession, signSession } from "./jwt";
import { LOCK_AFTER, login, requestPasswordReset, resetPassword } from "./service";
import { outbox } from "@/lib/email";
import { PasswordResetModel } from "@/models/password-reset";
import { UserModel } from "@/models/user";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";

const farmId = oid();
const PASSWORD = "lagos-broilers-2026";

async function makeUser(overrides: Record<string, unknown> = {}) {
  return UserModel.create({
    farmId,
    email: "ada@fowlex.com",
    name: "Ada Obi",
    role: "owner",
    passwordHash: await hashPassword(PASSWORD),
    ...overrides,
  });
}

describe("login", () => {
  it("signs in with the right email (any case) and password", async () => {
    await makeUser();
    const result = await login("  ADA@fowlex.com ", PASSWORD);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.lastLoginAt).toBeInstanceOf(Date);
  });

  it("gives the same answer for a wrong email and a wrong password", async () => {
    await makeUser();
    expect(await login("nobody@fowlex.com", PASSWORD)).toEqual({ ok: false, reason: "invalid" });
    expect(await login("ada@fowlex.com", "wrong-password")).toEqual({ ok: false, reason: "invalid" });
  });

  it("never signs in someone who has no password yet", async () => {
    await makeUser({ passwordHash: null });
    expect(await login("ada@fowlex.com", "fowlex-decoy-password")).toEqual({ ok: false, reason: "invalid" });
  });

  it(`locks the account for a while after ${LOCK_AFTER} wrong passwords`, async () => {
    await makeUser();
    const now = new Date("2026-11-26T10:00:00Z");
    for (let i = 0; i < LOCK_AFTER; i++) await login("ada@fowlex.com", "wrong", now);
    // Even the right password waits.
    expect(await login("ada@fowlex.com", PASSWORD, now)).toEqual({ ok: false, reason: "locked", minutes: 15 });
    const later = new Date(now.getTime() + 16 * 60_000);
    expect((await login("ada@fowlex.com", PASSWORD, later)).ok).toBe(true);
  });

  it("tells someone with the right password that their account is turned off", async () => {
    await makeUser({ status: "disabled" });
    expect(await login("ada@fowlex.com", PASSWORD)).toEqual({ ok: false, reason: "disabled" });
    expect(await login("ada@fowlex.com", "wrong")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("password reset", () => {
  const linkFor = (to: string) => {
    const mail = outbox().findLast((m) => m.to === to);
    return new URL(mail!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  };

  it("emails a single-use link that sets a new password and ends other sessions", async () => {
    const user = await makeUser();
    const before = user.sessionVersion;
    await requestPasswordReset("ada@fowlex.com", "https://app.fowlex.com");
    const token = linkFor("ada@fowlex.com");

    // Only the hash is stored.
    expect(await PasswordResetModel.countDocuments({ tokenHash: token })).toBe(0);

    const result = await resetPassword(token, "a-brand-new-password");
    expect(result.ok).toBe(true);
    expect((await login("ada@fowlex.com", "a-brand-new-password")).ok).toBe(true);
    expect((await UserModel.findById(user._id))!.sessionVersion).toBe(before + 1);

    expect(await resetPassword(token, "another-password-here")).toEqual({ ok: false, reason: "invalid-link" });
  });

  it("refuses an expired link, and a newer link replaces an older one", async () => {
    await makeUser();
    const t0 = new Date("2026-11-26T10:00:00Z");
    await requestPasswordReset("ada@fowlex.com", "https://app.fowlex.com", t0);
    const first = linkFor("ada@fowlex.com");
    expect(await resetPassword(first, "a-brand-new-password", new Date(t0.getTime() + 61 * 60_000))).toEqual({
      ok: false,
      reason: "invalid-link",
    });

    await requestPasswordReset("ada@fowlex.com", "https://app.fowlex.com", t0);
    const older = linkFor("ada@fowlex.com");
    await requestPasswordReset("ada@fowlex.com", "https://app.fowlex.com", t0);
    expect(await resetPassword(older, "a-brand-new-password", t0)).toEqual({ ok: false, reason: "invalid-link" });
  });

  it("sends nothing for an unknown email, and refuses a short password", async () => {
    const sent = outbox().length;
    await requestPasswordReset("nobody@fowlex.com", "https://app.fowlex.com");
    expect(outbox().length).toBe(sent);
    await makeUser();
    await requestPasswordReset("ada@fowlex.com", "https://app.fowlex.com");
    expect(await resetPassword(linkFor("ada@fowlex.com"), "short")).toEqual({ ok: false, reason: "weak-password" });
  });
});

describe("session token", () => {
  it("round-trips, and rejects tampering", async () => {
    const token = await signSession({ userId: "u1", sessionVersion: 3, role: "manager" });
    expect(await verifySession(token)).toEqual({ userId: "u1", sessionVersion: 3, role: "manager" });
    const [h, p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "u1", sv: 3, role: "owner" })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`)).toBeNull();
    expect(await verifySession(`${h}.${p}.`)).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });
});
