import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { shopSettings, updateShop } from "@/lib/shop/service";

/** The public order page's settings. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("sales.read");
  return NextResponse.json(await shopSettings(actor.farmId));
});

/** Turns the order page on or off, sets whether the farm delivers and the price per kg it shows. */
export const PATCH = apiRoute(async (request: Request) => {
  const actor = await requirePermission("sales.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateShop(actor, body));
});
