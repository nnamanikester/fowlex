import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createInvoice, listInvoices } from "@/lib/invoices/service";

/** Invoices, or one customer's (`?customerId=`). */
export const GET = apiRoute(async (request: Request) => {
  const actor = await requirePermission("invoice.read");
  const customerId = new URL(request.url).searchParams.get("customerId") ?? undefined;
  return NextResponse.json(await listInvoices(actor.farmId, { customerId }));
});

/** Bills a customer for delivered orders (`orderIds`), as a draft. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("invoice.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createInvoice(actor, body), { status: 201 });
});
