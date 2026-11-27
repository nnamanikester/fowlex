import { describe, expect, it } from "vitest";

import { acceptInvite, inviteUser, listTeam, previewInvite, resendInvite, revokeInvite, updateMember } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { outbox } from "@/lib/email";
import { FarmModel } from "@/models/farm";
import { UserModel } from "@/models/user";
import { setupTestDb } from "@/test/db";

setupTestDb();

const ORIGIN = "https://app.fowlex.com";

async function setup() {
  const farm = await FarmModel.create({ name: "Fowlex Farms" });
  const owner = await UserModel.create({ farmId: farm._id, email: "ada@fowlex.com", name: "Ada", role: "owner" });
  const actor: CurrentUser = { id: owner.id, farmId: String(farm._id), name: "Ada", email: owner.email, role: "owner" };
  return { farm, owner, actor };
}

const tokenFor = (email: string) => {
  const mail = outbox().findLast((m) => m.to === email)!;
  return new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
};

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (e: HttpError) => ({ status: e.status, code: e.code }),
  );

describe("invites", () => {
  it("invites someone who accepts once and joins with that role", async () => {
    const { actor } = await setup();
    await inviteUser(actor, { email: " Musa@Fowlex.com ", role: "manager" }, ORIGIN);
    const mail = outbox().findLast((m) => m.to === "musa@fowlex.com")!;
    expect(mail.subject).toBe("Ada invited you to Fowlex Farms");
    const token = tokenFor("musa@fowlex.com");

    expect(await previewInvite(token)).toMatchObject({
      ok: true,
      email: "musa@fowlex.com",
      role: "manager",
      invitedBy: "Ada",
    });

    const accepted = await acceptInvite(token, { name: "Musa Bello", password: "musa-password-1" });
    expect(accepted.ok).toBe(true);
    const user = await UserModel.findOne({ email: "musa@fowlex.com" });
    expect(user).toMatchObject({ name: "Musa Bello", role: "manager", status: "active" });

    // A reused link is refused.
    expect(await previewInvite(token)).toEqual({ ok: false, reason: "used" });
    expect(await acceptInvite(token, { name: "Again", password: "another-password" })).toEqual({
      ok: false,
      reason: "invalid-link",
    });
  });

  it("refuses an expired link", async () => {
    const { actor } = await setup();
    await inviteUser(actor, { email: "late@fowlex.com", role: "staff" }, ORIGIN);
    const token = tokenFor("late@fowlex.com");
    const eightDays = new Date(Date.now() + 8 * 24 * 60 * 60_000);
    expect(await acceptInvite(token, { name: "Late", password: "late-password-1" }, eightDays)).toEqual({
      ok: false,
      reason: "invalid-link",
    });
  });

  it("cancels the old link when re-invited, resent or revoked", async () => {
    const { actor } = await setup();
    const { id } = await inviteUser(actor, { email: "tunde@fowlex.com", role: "staff" }, ORIGIN);
    const first = tokenFor("tunde@fowlex.com");
    await resendInvite(actor, id, ORIGIN);
    const second = tokenFor("tunde@fowlex.com");
    expect(second).not.toBe(first);
    expect(await previewInvite(first)).toEqual({ ok: false, reason: "invalid" });

    await inviteUser(actor, { email: "tunde@fowlex.com", role: "manager" }, ORIGIN);
    expect(await previewInvite(second)).toEqual({ ok: false, reason: "invalid" });
    const third = tokenFor("tunde@fowlex.com");
    expect((await listTeam(actor)).invites).toHaveLength(1);

    const [pending] = (await listTeam(actor)).invites;
    await revokeInvite(actor, pending.id);
    expect(await previewInvite(third)).toEqual({ ok: false, reason: "invalid" });
    expect((await listTeam(actor)).invites).toHaveLength(0);
  });

  it("invites finance and sales, who show on the team with their role", async () => {
    const { actor } = await setup();
    await inviteUser(actor, { email: "ngozi@fowlex.com", role: "finance" }, ORIGIN);
    await inviteUser(actor, { email: "chidi@fowlex.com", role: "sales" }, ORIGIN);
    const team = await listTeam(actor);
    expect(team.invites.map((i) => [i.email, i.role]).sort()).toEqual([
      ["chidi@fowlex.com", "sales"],
      ["ngozi@fowlex.com", "finance"],
    ]);
  });

  it("won't invite someone who already has an account, or to a portal role", async () => {
    const { actor } = await setup();
    expect(await refusal(inviteUser(actor, { email: "ada@fowlex.com", role: "staff" }, ORIGIN))).toEqual({
      status: 409,
      code: "already_member",
    });
    expect(await refusal(inviteUser(actor, { email: "x@fowlex.com", role: "customer" }, ORIGIN))).toMatchObject({
      code: "invalid_role",
    });
    expect(await refusal(inviteUser(actor, { email: "not-an-email", role: "staff" }, ORIGIN))).toMatchObject({
      code: "invalid_email",
    });
  });
});

describe("updateMember", () => {
  it("never removes the last owner", async () => {
    const { actor, owner } = await setup();
    expect(await refusal(updateMember(actor, owner.id, { role: "manager" }))).toEqual({
      status: 409,
      code: "last_owner",
    });

    const second = await UserModel.create({ farmId: actor.farmId, email: "b@fowlex.com", name: "B", role: "owner" });
    expect(await refusal(updateMember(actor, second.id, { status: "disabled" }))).toBeNull();
    // B is off, so Ada is the last active owner again.
    expect(await refusal(updateMember(actor, owner.id, { role: "staff" }))).toEqual({
      status: 409,
      code: "last_owner",
    });
  });

  it("changes a role or turns an account off, and ends that person's sessions", async () => {
    const { actor } = await setup();
    const musa = await UserModel.create({ farmId: actor.farmId, email: "m@fowlex.com", name: "M", role: "manager" });
    await updateMember(actor, musa.id, { role: "staff" });
    await updateMember(actor, musa.id, { status: "disabled" });
    expect(await UserModel.findById(musa._id).lean()).toMatchObject({
      role: "staff",
      status: "disabled",
      sessionVersion: 2,
    });
  });

  it("won't let you turn yourself off, or touch another farm's people", async () => {
    const { actor, owner } = await setup();
    expect(await refusal(updateMember(actor, owner.id, { status: "disabled" }))).toMatchObject({ code: "self" });
    const other = await FarmModel.create({ name: "Other" });
    const stranger = await UserModel.create({ farmId: other._id, email: "s@other.com", name: "S", role: "staff" });
    expect(await refusal(updateMember(actor, stranger.id, { role: "manager" }))).toMatchObject({ status: 404 });
  });
});
