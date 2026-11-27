import "server-only";

import { cache } from "react";
import { cacheLife } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySession } from "./jwt";
import type { Role } from "./permissions";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/user";

/** The signed-in person, as the app sees them: never the password hash or the raw session. */
export type CurrentUser = { id: string; farmId: string; name: string; email: string; role: Role };

/** Reads the session cookie, then checks the user in the database. Never cached on its own. */
async function lookUpUser(): Promise<CurrentUser | null> {
  const claims = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  await connectDb();
  const user = await UserModel.findById(claims.userId, {
    name: 1,
    email: 1,
    role: 1,
    status: 1,
    sessionVersion: 1,
    farmId: 1,
  }).lean();
  if (!user || user.status !== "active" || user.sessionVersion !== claims.sessionVersion) return null;
  return {
    id: String(user._id),
    farmId: String(user.farmId),
    name: user.name,
    email: user.email,
    role: user.role as Role,
  };
}

/**
 * Who is signed in, for pages. Checks the token and then the database, so an account turned off or
 * a password reset ends the session. Reads the request, so call it behind <Suspense>.
 *
 * In production it's private-cached: Next renders each page twice per request, and this makes one
 * lookup serve both, then lets the browser reuse the page for 30 s while moving around (never
 * stored on the server). In development Next's private cache answers from the last request while
 * refreshing in the background, which would show stale roles, so development reads fresh.
 */
export const getCurrentUser: () => Promise<CurrentUser | null> =
  process.env.NODE_ENV === "production" ? privateUser : cache(lookUpUser);

async function privateUser() {
  "use cache: private";
  cacheLife("session");
  return lookUpUser();
}

/**
 * Who is signed in, for API routes: always checked against the database, so a change (a write)
 * never rides on a cached answer. Once per request.
 */
export const getSessionUser = cache(lookUpUser);

/**
 * The signed-in person, or off to sign in, through a route that clears the ended session's cookie
 * first. For pages; API routes answer 401 instead.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session/expired");
  return user;
}
