import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createItem, listItems } from "@/lib/inventory/items";

/** The farm's stock items. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("inventory.read");
  return NextResponse.json(await listItems(actor.farmId));
});

/** Adds a stock item. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("inventory.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createItem(actor, body), { status: 201 });
});
