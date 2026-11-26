import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as accept } from "./invite/route";
import { POST as forgot } from "./forgot/route";
import { POST as login } from "./login/route";
import { POST as reset } from "./reset/route";
import { GET as expired } from "./session/expired/route";
import { DELETE as signOut } from "./session/route";
import { hashPassword } from "@/lib/auth/hash";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";
import { outbox } from "@/lib/email";
import { inviteUser } from "@/lib/users/service";
import { FarmModel } from "@/models/farm";
import { UserModel } from "@/models/user";
import { setupTestDb } from "@/test/db";

setupTestDb();
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
beforeEach(() => vi.spyOn(console, "info").mockImplementation(() => undefined));

const URL_ = "https://app.fowlex.com";
const post = (path: string, body: unknown) =>
  new Request(`${URL_}${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const sessionOf = async (response: Response) => {
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? verifySession(cookie.split(";")[0].split("=")[1]) : null;
};

async function seed(overrides: Record<string, unknown> = {}) {
  const farm = await FarmModel.create({ name: "Fowlex Farms" });
  const user = await UserModel.create({
    farmId: farm._id,
    email: "ada@fowlex.com",
    name: "Ada",
    role: "owner",
    passwordHash: await hashPassword("right-password-1"),
    ...overrides,
  });
  return { farm, user };
}
const linkTo = (email: string) =>
  new URL(
    outbox()
      .findLast((m) => m.to === email)!
      .text.match(/https?:\/\/\S+/)![0],
  ).searchParams.get("token")!;

describe("POST /api/auth/login", () => {
  it("sets an httpOnly session cookie for the right password", async () => {
    const { user } = await seed();
    const response = await login(post("/api/auth/login", { email: "ada@fowlex.com", password: "right-password-1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Ada", role: "owner" });
    expect(response.headers.getSetCookie()[0]).toMatch(/HttpOnly/i);
    expect(await sessionOf(response)).toEqual({ userId: user.id, sessionVersion: 0, role: "owner" });
  });

  it("answers 400 for missing fields or a body that isn't JSON", async () => {
    expect((await login(post("/api/auth/login", { email: "a" }))).status).toBe(400);
    expect((await login(post("/api/auth/login", "{not json"))).status).toBe(400);
  });

  it("answers 401, then 429 when locked, without a cookie", async () => {
    await seed();
    const wrong = () => login(post("/api/auth/login", { email: "ada@fowlex.com", password: "wrong" }));
    const first = await wrong();
    expect(first.status).toBe(401);
    expect((await first.json()).error.code).toBe("invalid_credentials");
    expect(first.headers.getSetCookie()).toEqual([]);
    for (let i = 0; i < 4; i++) await wrong();
    const locked = await wrong();
    expect(locked.status).toBe(429);
    expect((await locked.json()).error.message).toMatch(/Try again in 15 minutes/);
  });

  it("answers 403 for a turned-off account with the right password", async () => {
    await seed({ status: "disabled" });
    const response = await login(post("/api/auth/login", { email: "ada@fowlex.com", password: "right-password-1" }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("disabled");
  });
});

describe("sessions", () => {
  it("DELETE /api/auth/session clears the cookie", async () => {
    const response = await signOut();
    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=;.*Max-Age=0`, "i"));
  });

  it("GET /api/auth/session/expired clears it and goes to sign in", async () => {
    const response = await expired(new Request(`${URL_}/api/auth/session/expired`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${URL_}/auth/login?reason=expired`);
    expect(response.headers.getSetCookie()[0]).toMatch(/Max-Age=0/i);
  });
});

describe("password reset routes", () => {
  it("forgot: 400 without an email, the same 200 whether or not it exists", async () => {
    await seed();
    expect((await forgot(post("/api/auth/forgot", {}))).status).toBe(400);
    const known = await forgot(post("/api/auth/forgot", { email: "ada@fowlex.com" }));
    const unknown = await forgot(post("/api/auth/forgot", { email: "nobody@fowlex.com" }));
    expect([known.status, unknown.status]).toEqual([200, 200]);
    expect(await known.json()).toEqual(await unknown.json());
    expect(linkTo("ada@fowlex.com")).toBeTruthy();
  });

  it("reset: refuses a short password or a bad link, and signs in on success", async () => {
    const { user } = await seed();
    await forgot(post("/api/auth/forgot", { email: "ada@fowlex.com" }));
    const token = linkTo("ada@fowlex.com");

    const short = await reset(post("/api/auth/reset", { token, password: "short" }));
    expect(short.status).toBe(400);
    expect((await short.json()).error).toMatchObject({ code: "weak_password", field: "password" });
    expect((await reset(post("/api/auth/reset", { token: "nope", password: "new-password-123" }))).status).toBe(400);

    const ok = await reset(post("/api/auth/reset", { token, password: "new-password-123" }));
    expect(ok.status).toBe(200);
    expect(await sessionOf(ok)).toEqual({ userId: user.id, sessionVersion: 1, role: "owner" });
  });
});

describe("POST /api/auth/invite", () => {
  it("validates, then creates the account, signs in and says where to go", async () => {
    const { user, farm } = await seed();
    await inviteUser(
      { id: user.id, farmId: String(farm._id), name: "Ada", email: user.email, role: "owner" },
      { email: "tunde@fowlex.com", role: "staff" },
      URL_,
    );
    const token = linkTo("tunde@fowlex.com");

    const noName = await accept(post("/api/auth/invite", { token, name: "", password: "tunde-password-1" }));
    expect((await noName.json()).error).toMatchObject({ code: "invalid_name", field: "name" });
    const weak = await accept(post("/api/auth/invite", { token, name: "Tunde", password: "x" }));
    expect((await weak.json()).error).toMatchObject({ code: "weak_password", field: "password" });
    const bad = await accept(post("/api/auth/invite", { token: "nope", name: "Tunde", password: "tunde-password-1" }));
    expect((await bad.json()).error.code).toBe("invalid_link");

    const ok = await accept(post("/api/auth/invite", { token, name: "Tunde", password: "tunde-password-1" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ home: "/log" });
    expect((await sessionOf(ok))?.role).toBe("staff");
  });
});

describe("auth bodies that aren't JSON", () => {
  it("get the validation answer, not a crash", async () => {
    const raw = (path: string) => new Request(`${URL_}${path}`, { method: "POST", body: "{oops" });
    expect((await forgot(raw("/api/auth/forgot"))).status).toBe(400);
    expect((await (await reset(raw("/api/auth/reset"))).json()).error.code).toBe("weak_password");
    expect((await (await accept(raw("/api/auth/invite"))).json()).error.code).toBe("invalid_name");
  });
});
