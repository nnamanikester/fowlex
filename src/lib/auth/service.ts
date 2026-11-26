import "server-only";

import { hashPassword, verifyPassword } from "./hash";
import { PASSWORD_MAX, PASSWORD_MIN } from "./password";
import { hashToken, newToken } from "./tokens";
import { connectDb, withTransaction } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { PasswordResetModel } from "@/models/password-reset";
import { type UserDocument, UserModel } from "@/models/user";

/** Five wrong passwords in a row lock the account for fifteen minutes. */
export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;
export const RESET_MINUTES = 60;

export type LoginResult =
  | { ok: true; user: UserDocument }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; minutes: number }
  | { ok: false; reason: "disabled" };

const normalise = (email: string) => email.trim().toLowerCase();

/**
 * Checks an email and password. A wrong email and a wrong password give the same answer (and take
 * the same time), so the form never says which was wrong. "disabled" is only said to someone who
 * knew the password.
 */
export async function login(email: string, password: string, now = new Date()): Promise<LoginResult> {
  await connectDb();
  const user = await UserModel.findOne({ email: normalise(email) }).select("+passwordHash");

  if (user?.lockedUntil && user.lockedUntil > now) {
    await verifyPassword(password, null); // Same work as a real check.
    return { ok: false, reason: "locked", minutes: Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000) };
  }

  const matches = await verifyPassword(password, user?.passwordHash);
  if (!user || !matches) {
    if (user) {
      user.failedLogins += 1;
      if (user.failedLogins >= LOCK_AFTER) {
        user.failedLogins = 0;
        user.lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
      }
      await user.save();
    }
    return { ok: false, reason: "invalid" };
  }
  if (user.status !== "active") return { ok: false, reason: "disabled" };

  user.failedLogins = 0;
  user.lockedUntil = null;
  user.lastLoginAt = now;
  await user.save();
  return { ok: true, user };
}

/**
 * Emails a reset link if the address belongs to an active account, and does nothing otherwise:
 * the caller always says "if there's an account, we've sent a link". Earlier links stop working.
 */
export async function requestPasswordReset(email: string, origin: string, now = new Date()) {
  await connectDb();
  const user = await UserModel.findOne({ email: normalise(email), status: "active" });
  if (!user) return;

  const token = newToken();
  await PasswordResetModel.updateMany({ userId: user._id, usedAt: null }, { usedAt: now });
  await PasswordResetModel.create({
    farmId: user.farmId,
    userId: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + RESET_MINUTES * 60_000),
  });

  const link = `${origin}/auth/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your Fowlex password",
    text: [
      `Hello ${user.name},`,
      "",
      "Someone (hopefully you) asked to reset the password for your Fowlex account. Open this link to choose a new one:",
      "",
      link,
      "",
      `The link works once and expires in ${RESET_MINUTES} minutes. If you didn't ask, ignore this email: your password stays as it is.`,
    ].join("\n"),
  });
}

export type ResetResult = { ok: true; user: UserDocument } | { ok: false; reason: "invalid-link" | "weak-password" };

/**
 * Sets a new password from a reset link: once, before it expires. Every other session ends (the
 * session version moves on) and any lock is lifted.
 */
export async function resetPassword(token: string, password: string, now = new Date()): Promise<ResetResult> {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return { ok: false, reason: "weak-password" };
  await connectDb();
  const passwordHash = await hashPassword(password);

  return withTransaction(async (session) => {
    const reset = await PasswordResetModel.findOneAndUpdate(
      { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: now } },
      { usedAt: now },
      { session },
    );
    if (!reset) return { ok: false, reason: "invalid-link" } as const;

    const user = await UserModel.findOneAndUpdate(
      { _id: reset.userId, status: "active" },
      { passwordHash, $inc: { sessionVersion: 1 }, failedLogins: 0, lockedUntil: null },
      { session, returnDocument: "after" },
    );
    if (!user) return { ok: false, reason: "invalid-link" } as const;
    return { ok: true, user } as const;
  });
}
