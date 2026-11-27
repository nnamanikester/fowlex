import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { submitOtp } from "@/lib/payouts/service";

/** Releases a transfer Paystack held for an OTP. Owners only. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/payouts/[id]/otp">) => {
  const actor = await requirePermission("payout.send");
  const { otp } = (await request.json().catch(() => ({}))) as { otp?: unknown };
  return NextResponse.json(await submitOtp(actor, (await context.params).id, otp));
});
