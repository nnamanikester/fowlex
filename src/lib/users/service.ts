import "server-only";

import type { Types } from "mongoose";

import type { CurrentUser } from "@/lib/auth/current-user";
import { hashPassword } from "@/lib/auth/hash";
import { HttpError } from "@/lib/auth/guard";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/password";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { connectDb, withTransaction } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { FarmModel } from "@/models/farm";
import { InviteModel } from "@/models/invite";
import { type UserDocument, UserModel } from "@/models/user";

export const INVITE_DAYS = 7;

/** Roles an owner can invite into the dashboard. Customers are invited from their customer page (6.7). */
export const TEAM_ROLES = ["owner", "manager", "staff"] as const satisfies readonly Role[];
type TeamRole = (typeof TEAM_ROLES)[number];

const isTeamRole = (role: unknown): role is TeamRole => TEAM_ROLES.includes(role as TeamRole);
const normalise = (email: string) => email.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Everyone on the farm and every invite still waiting, for the users page. */
export async function listTeam(actor: CurrentUser) {
  await connectDb();
  const [users, invites] = await Promise.all([
    UserModel.find({ farmId: actor.farmId, role: { $in: TEAM_ROLES } })
      .sort({ createdAt: 1 })
      .lean(),
    InviteModel.find({ farmId: actor.farmId, acceptedAt: null, revokedAt: null, role: { $in: TEAM_ROLES } })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  // Inviters are owners on this team: name them from the list above rather than a second query.
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  return {
    users: users.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role as TeamRole,
      status: u.status,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      isYou: String(u._id) === actor.id,
    })),
    invites: invites.map((i) => ({
      id: String(i._id),
      email: i.email,
      role: i.role as TeamRole,
      invitedBy: (i.createdBy && names.get(String(i.createdBy))) ?? null,
      sentAt: i.createdAt.toISOString(),
      expired: i.expiresAt < new Date(),
    })),
  };
}

export type Team = Awaited<ReturnType<typeof listTeam>>;

/**
 * Invites `email` to join with `role` and emails the link. An earlier invite to the same email
 * stops working. Someone already on the team can't be invited again.
 */
export async function inviteUser(actor: CurrentUser, input: { email: string; role: string }, origin: string) {
  const email = normalise(input.email);
  if (!EMAIL.test(email)) throw new HttpError(400, "invalid_email", "Enter a valid email, like musa@fowlex.com.");
  if (!isTeamRole(input.role)) throw new HttpError(400, "invalid_role", "Choose owner, manager or staff.");
  await connectDb();
  if (await UserModel.exists({ email }))
    throw new HttpError(409, "already_member", `${email} already has a Fowlex account.`);

  const now = new Date();
  await InviteModel.updateMany({ farmId: actor.farmId, email, acceptedAt: null, revokedAt: null }, { revokedAt: now });
  const token = newToken();
  const invite = await InviteModel.create({
    farmId: actor.farmId,
    createdBy: actor.id,
    email,
    role: input.role,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60_000),
  });
  await sendInviteEmail(actor, email, input.role, token, origin);
  return { id: String(invite._id) };
}

/** Sends a fresh link for a waiting invite (the old link stops working), with another seven days. */
export async function resendInvite(actor: CurrentUser, inviteId: string, origin: string) {
  await connectDb();
  const invite = await InviteModel.findOne({ _id: inviteId, farmId: actor.farmId, acceptedAt: null, revokedAt: null });
  if (!invite) throw new HttpError(404, "not_found", "That invite has been accepted or cancelled.");
  const token = newToken();
  invite.tokenHash = hashToken(token);
  invite.expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60_000);
  await invite.save();
  await sendInviteEmail(actor, invite.email, invite.role as Role, token, origin);
}

export async function revokeInvite(actor: CurrentUser, inviteId: string) {
  await connectDb();
  const result = await InviteModel.updateOne(
    { _id: inviteId, farmId: actor.farmId, acceptedAt: null, revokedAt: null },
    { revokedAt: new Date() },
  );
  if (!result.modifiedCount) throw new HttpError(404, "not_found", "That invite has been accepted or cancelled.");
}

async function sendInviteEmail(actor: CurrentUser, email: string, role: Role, token: string, origin: string) {
  const farm = await FarmModel.findById(actor.farmId).lean();
  const link = `${origin}/auth/invite?token=${token}`;
  await sendEmail({
    to: email,
    subject: `${actor.name} invited you to ${farm?.name ?? "Fowlex"}`,
    text: [
      `${actor.name} invited you to join ${farm?.name ?? "Fowlex"} on Fowlex as ${ROLE_LABELS[role].toLowerCase()}.`,
      "",
      "Open this link to set your name and password:",
      "",
      link,
      "",
      `The link works once and expires in ${INVITE_DAYS} days.`,
    ].join("\n"),
  });
}

/** What the invite page shows, or why the link doesn't work. */
export async function previewInvite(token: string) {
  await connectDb();
  const invite = await InviteModel.findOne({ tokenHash: hashToken(token) })
    .populate<{ createdBy: { name: string } | null }>("createdBy", "name")
    .lean();
  if (!invite || invite.revokedAt) return { ok: false, reason: "invalid" } as const;
  if (invite.acceptedAt) return { ok: false, reason: "used" } as const;
  if (invite.expiresAt < new Date()) return { ok: false, reason: "expired" } as const;
  const farm = await FarmModel.findById(invite.farmId).lean();
  return {
    ok: true,
    email: invite.email,
    role: invite.role as Role,
    invitedBy: invite.createdBy?.name ?? null,
    farmName: farm?.name ?? "Fowlex",
  } as const;
}

export type AcceptResult =
  { ok: true; user: UserDocument } | { ok: false; reason: "invalid-link" | "weak-password" | "name" };

/** Accepts an invite: creates the account with the invited role, once, before it expires. */
export async function acceptInvite(
  token: string,
  input: { name: string; password: string },
  now = new Date(),
): Promise<AcceptResult> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) return { ok: false, reason: "name" };
  if (input.password.length < PASSWORD_MIN || input.password.length > PASSWORD_MAX)
    return { ok: false, reason: "weak-password" };
  await connectDb();
  const passwordHash = await hashPassword(input.password);

  return withTransaction(async (session) => {
    const invite = await InviteModel.findOneAndUpdate(
      { tokenHash: hashToken(token), acceptedAt: null, revokedAt: null, expiresAt: { $gt: now } },
      { acceptedAt: now },
      { session },
    );
    if (!invite) return { ok: false, reason: "invalid-link" } as const;
    if (await UserModel.exists({ email: invite.email }).session(session))
      return { ok: false, reason: "invalid-link" } as const;
    const [user] = await UserModel.create(
      [
        {
          farmId: invite.farmId,
          createdBy: invite.createdBy,
          email: invite.email,
          name,
          role: invite.role,
          passwordHash,
          lastLoginAt: now,
        },
      ],
      { session },
    );
    return { ok: true, user } as const;
  });
}

/** How many active owners would remain if `userId` stopped being one. */
async function ownersWithout(farmId: string, userId: Types.ObjectId | string) {
  return UserModel.countDocuments({ farmId, role: "owner", status: "active", _id: { $ne: userId } });
}

/**
 * Changes someone's role or turns their account off or on. Their sessions end, so the change
 * applies at once. The farm always keeps at least one active owner, and nobody turns themselves off.
 */
export async function updateMember(actor: CurrentUser, userId: string, change: { role?: string; status?: string }) {
  if (change.role !== undefined && !isTeamRole(change.role))
    throw new HttpError(400, "invalid_role", "Choose owner, manager or staff.");
  if (change.status !== undefined && change.status !== "active" && change.status !== "disabled")
    throw new HttpError(400, "invalid_status", "Status is active or disabled.");
  await connectDb();
  const user = await UserModel.findOne({ _id: userId, farmId: actor.farmId, role: { $in: TEAM_ROLES } });
  if (!user) throw new HttpError(404, "not_found", "That person isn't on your team.");

  if (change.status === "disabled" && user.id === actor.id)
    throw new HttpError(400, "self", "You can't turn off your own account.");
  const losesOwner =
    user.role === "owner" &&
    user.status === "active" &&
    ((change.role !== undefined && change.role !== "owner") || change.status === "disabled");
  if (losesOwner && (await ownersWithout(actor.farmId, user._id)) === 0)
    throw new HttpError(409, "last_owner", "The farm needs at least one owner. Make someone else an owner first.");

  if (change.role !== undefined) user.role = change.role;
  if (change.status !== undefined) user.status = change.status as "active" | "disabled";
  user.sessionVersion += 1;
  await user.save();
}
