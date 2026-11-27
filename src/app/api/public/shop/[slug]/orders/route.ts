import { NextResponse } from "next/server";

import { apiRoute } from "@/lib/auth/guard";
import { placeOnlineOrder } from "@/lib/shop/service";

/** A customer places an order from the public page (no sign-in). */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/public/shop/[slug]/orders">) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return NextResponse.json(
    await placeOnlineOrder((await context.params).slug, body, { ip, origin: new URL(request.url).origin }),
    { status: 201 },
  );
});
