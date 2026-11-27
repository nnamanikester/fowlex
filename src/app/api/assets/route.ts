import { NextResponse } from "next/server";

import { createAsset, listAssets } from "@/lib/assets/service";
import { apiRoute, requirePermission } from "@/lib/auth/guard";

/** The farm's equipment, with book values. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("expense.read");
  return NextResponse.json(await listAssets(actor.farmId));
});

/** Adds equipment the farm already has. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("expense.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createAsset(actor, body), { status: 201 });
});
