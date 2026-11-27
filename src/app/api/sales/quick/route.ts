import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { quickSale } from "@/lib/sales/quick";

/** Sells birds over the counter in one go: delivered, invoiced, and paid in cash, by transfer or later. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("sales.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await quickSale(actor, body), { status: 201 });
});
