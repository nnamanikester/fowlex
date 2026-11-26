import "server-only";

import { NextResponse } from "next/server";

import { type CurrentUser, getCurrentUser } from "./current-user";
import { setActor, withAuditContext } from "@/lib/audit/context";
import { can, type Permission, type Role } from "./permissions";

/** A refusal an API route turns into a JSON error. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** The form field the problem is about, so the form can show it there. */
    readonly field?: string,
  ) {
    super(message);
  }
}

/** The signed-in person, or a 401. */
export async function requireSession(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "unauthenticated", "Sign in first.");
  // Every change for the rest of this request is logged as theirs.
  setActor({ id: user.id, name: user.name });
  return user;
}

/** The signed-in person if their role is one of `roles`, or a 403. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireSession();
  if (!roles.includes(user.role)) throw new HttpError(403, "forbidden", "Your role can't do this.");
  return user;
}

/** The signed-in person if their role has `permission`, or a 403. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireSession();
  if (!can(user.role, permission)) throw new HttpError(403, "forbidden", "Your role can't do this.");
  return user;
}

/**
 * Wraps a route handler so a guard's refusal becomes `{ error: { code, message } }` with its
 * status, and so changes it makes are logged as the signed-in person's. Every handler starts with
 * requireSession(), requireRole() or requirePermission().
 */
export function apiRoute<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return (...args: Args): Promise<Response> =>
    withAuditContext(async () => {
      try {
        return await handler(...args);
      } catch (error) {
        if (error instanceof HttpError)
          return NextResponse.json(
            { error: { code: error.code, message: error.message, field: error.field } },
            { status: error.status },
          );
        throw error;
      }
    });
}
