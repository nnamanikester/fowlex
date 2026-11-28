import { NextResponse } from "next/server";

import { apiRoute } from "@/lib/auth/guard";
import { transferByLink } from "@/lib/collections/service";

/** A bank account for this invoice only, to pay by transfer. */
export const POST = apiRoute(async (_request: Request, context: RouteContext<"/api/public/pay/[token]/transfer">) =>
  NextResponse.json(await transferByLink((await context.params).token), { status: 201 }),
);
