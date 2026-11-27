import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createCustomer, listCustomers } from "@/lib/customers/service";

/** The farm's customers. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("customer.read");
  return NextResponse.json(await listCustomers(actor.farmId));
});

/** Adds a customer. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("customer.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createCustomer(actor, body), { status: 201 });
});
