import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { saveTopUp } from "@/lib/balance/service";

/** Saves the top-up account the Paystack Dashboard shows. Owners only. */
export const PATCH = apiRoute(async (request: Request) => {
  const actor = await requirePermission("settings.manage");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(
    await saveTopUp(actor, {
      bankName: typeof body.bankName === "string" ? body.bankName : "",
      accountNumber: typeof body.accountNumber === "string" ? body.accountNumber : "",
      accountName: typeof body.accountName === "string" ? body.accountName : "",
    }),
  );
});
