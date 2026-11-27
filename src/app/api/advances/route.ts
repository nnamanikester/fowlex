import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createAdvance, listAdvances } from "@/lib/people/advances";

/** The farm's advances, or one person's (`?employeeId=`). */
export const GET = apiRoute(async (request: Request) => {
  const actor = await requirePermission("people.read");
  const employeeId = new URL(request.url).searchParams.get("employeeId") ?? undefined;
  return NextResponse.json(await listAdvances(actor.farmId, employeeId));
});

/** Gives someone an advance, recorded as a labour expense. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("people.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createAdvance(actor, body), { status: 201 });
});
