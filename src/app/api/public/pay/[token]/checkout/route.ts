import { NextResponse } from "next/server";

import { apiRoute } from "@/lib/auth/guard";
import { checkoutByLink } from "@/lib/collections/service";

/** Opens Paystack's checkout for what's left on the invoice; the page sends the customer there. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/public/pay/[token]/checkout">) =>
  NextResponse.json(await checkoutByLink((await context.params).token, new URL(request.url).origin), { status: 201 }),
);
