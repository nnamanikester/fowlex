import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { emailStatement } from "@/lib/statements/service";

/** Emails the customer their statement for `from`–`to`. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/customers/[id]/statement/email">) => {
  const actor = await requirePermission("invoice.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(
    await emailStatement(actor, (await context.params).id, {
      from: typeof body.from === "string" ? body.from : undefined,
      to: typeof body.to === "string" ? body.to : undefined,
    }),
  );
});
