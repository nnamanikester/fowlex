import { NextResponse } from "next/server";

import { apiRoute, HttpError, requireSession } from "@/lib/auth/guard";
import { checkCollection } from "@/lib/collections/service";
import { portalInvoice } from "@/lib/portal/service";

/** Has the customer's transfer landed? Only for their own invoices. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/portal/collections/[id]">) => {
  const user = await requireSession();
  const collection = await checkCollection(user.farmId, (await context.params).id);
  await portalInvoice(user, collection.invoiceId).catch(() => {
    throw new HttpError(404, "not_found", "That payment isn't here.");
  });
  return NextResponse.json(collection);
});
