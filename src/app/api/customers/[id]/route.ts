import { NextResponse } from "next/server";

import { apiRoute, HttpError, requirePermission } from "@/lib/auth/guard";
import { deleteCustomer, getCustomer, updateCustomer } from "@/lib/customers/service";

/** One customer. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/customers/[id]">) => {
  const actor = await requirePermission("customer.read");
  const customer = await getCustomer(actor.farmId, (await context.params).id);
  if (!customer) throw new HttpError(404, "not_found", "That customer isn't on the list any more.");
  return NextResponse.json(customer);
});

/** Saves a customer's details; the body carries the `version` the form loaded. */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/customers/[id]">) => {
  const actor = await requirePermission("customer.write");
  const { version, ...body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateCustomer(actor, (await context.params).id, body, version));
});

/** Removes a customer added by mistake. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/customers/[id]">) => {
  const actor = await requirePermission("customer.write");
  await deleteCustomer(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
