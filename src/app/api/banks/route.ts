import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { listBanks } from "@/lib/paystack/banks";

/** Nigerian banks Paystack can pay, for the bank picker. */
export const GET = apiRoute(async () => {
  await requirePermission("supplier.write");
  return NextResponse.json(await listBanks(), { headers: { "Cache-Control": "private, max-age=3600" } });
});
