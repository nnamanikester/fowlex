import { NextResponse } from "next/server";

import { apiRoute } from "@/lib/auth/guard";
import { checkByLink } from "@/lib/collections/service";

/** Has the transfer landed? Checked with Paystack, for this invoice's own payments only. */
export const GET = apiRoute(
  async (_request: Request, context: RouteContext<"/api/public/pay/[token]/collections/[id]">) => {
    const { token, id } = await context.params;
    return NextResponse.json(await checkByLink(token, id));
  },
);
