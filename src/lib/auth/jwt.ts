import { jwtVerify, SignJWT } from "jose";

import { ROLES, type Role } from "./permissions";

/**
 * The session token: a JWT signed with JWT_SECRET (HS256) in an httpOnly cookie. It says who and
 * which session version; the server still checks the user in the database on every page, so
 * turning an account off or resetting a password ends its sessions at once. Kept free of
 * database and server-only imports so the proxy can check it too.
 */
export const SESSION_COOKIE = "fowlex_session";
export const SESSION_DAYS = 7;

export type SessionClaims = { userId: string; sessionVersion: number; role: Role };

function key() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("JWT_SECRET must be set to at least 32 characters (openssl rand -base64 48).");
  return new TextEncoder().encode(secret);
}

export async function signSession({ userId, sessionVersion, role }: SessionClaims) {
  return new SignJWT({ sv: sessionVersion, role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

/** The claims of a valid, unexpired token; null for anything else. */
export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const role = payload.role as Role;
    if (!payload.sub || typeof payload.sv !== "number" || !ROLES.includes(role)) return null;
    return { userId: payload.sub, sessionVersion: payload.sv, role };
  } catch {
    return null;
  }
}

/** The cookie that carries the token: unreadable by scripts, HTTPS-only in production. */
export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export const clearedSessionCookie = { ...sessionCookie(""), maxAge: 0 };
