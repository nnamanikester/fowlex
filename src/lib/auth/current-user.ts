import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySession } from "./jwt";
import type { Role } from "./permissions";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/user";

/** The signed-in person, as the app sees them: never the password hash or the raw session. */
export type CurrentUser = { id: string; farmId: string; name: string; email: string; role: Role };

/**
 * Who is signed in, or null. Checks the token and then the database, so an account turned off or a
 * password reset ends the session straight away. Reads the request, so call it behind <Suspense>.
 * Cached for the rest of the request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const claims = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  await connectDb();
  const user = await UserModel.findById(claims.userId).lean();
  if (!user || user.status !== "active" || user.sessionVersion !== claims.sessionVersion) return null;
  return {
    id: String(user._id),
    farmId: String(user.farmId),
    name: user.name,
    email: user.email,
    role: user.role as Role,
  };
});

/**
 * The signed-in person, or off to sign in, through a route that clears the ended session's cookie
 * first. For pages; API routes answer 401 instead.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session/expired");
  return user;
}
