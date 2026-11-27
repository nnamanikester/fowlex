import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { listPayments, recordPayment } from "@/lib/payments/service";

/** The payments on an invoice. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/invoices/[id]/payments">) => {
  const actor = await requirePermission("invoice.read");
  return NextResponse.json(await listPayments(actor.farmId, { invoiceId: (await context.params).id }));
});

/** Records money the customer paid on it. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/invoices/[id]/payments">) => {
  const actor = await requirePermission("payment.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await recordPayment(actor, (await context.params).id, body), { status: 201 });
});
