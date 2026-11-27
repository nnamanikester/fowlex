import { NextResponse } from "next/server";

import { apiRoute, requireSession } from "@/lib/auth/guard";
import { portalInvoice } from "@/lib/portal/service";

/** One of the customer's own invoices; another customer's is 404. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/portal/invoices/[id]">) =>
  NextResponse.json(await portalInvoice(await requireSession(), (await context.params).id)),
);
