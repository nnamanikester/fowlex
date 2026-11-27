import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createOrder, listOrders } from "@/lib/sales/service";

/** Sales orders; one customer's (`?customerId=`) or one batch's (`?batchId=`). */
export const GET = apiRoute(async (request: Request) => {
  const actor = await requirePermission("sales.read");
  const params = new URL(request.url).searchParams;
  return NextResponse.json(
    await listOrders(actor.farmId, {
      customerId: params.get("customerId") ?? undefined,
      batchId: params.get("batchId") ?? undefined,
    }),
  );
});

/** Books an order; over the customer's limit it needs `confirm: true`. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("sales.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createOrder(actor, body), { status: 201 });
});
