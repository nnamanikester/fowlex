import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { quote } from "@/lib/sales/service";

/** A customer's price on a day (`?customerId=…&date=…`) and what they owe against their limit. */
export const GET = apiRoute(async (request: Request) => {
  const actor = await requirePermission("sales.read");
  const params = new URL(request.url).searchParams;
  return NextResponse.json(await quote(actor.farmId, params.get("customerId") ?? "", params.get("date") ?? ""));
});
