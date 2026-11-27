import { NextResponse } from "next/server";

import { apiRoute, HttpError } from "@/lib/auth/guard";
import { shopOffer } from "@/lib/shop/service";

/** What a farm's order page offers now (no sign-in): birds ready by day, weight and price. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/public/shop/[slug]">) => {
  const offer = await shopOffer((await context.params).slug);
  if (!offer) throw new HttpError(404, "not_found", "This order page isn't taking orders right now.");
  return NextResponse.json(offer, { headers: { "Cache-Control": "no-store" } });
});
