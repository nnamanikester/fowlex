import { NextResponse } from "next/server";

import { apiRoute, requireAnyPermission } from "@/lib/auth/guard";
import { listBanks } from "@/lib/paystack/banks";

/** Nigerian banks Paystack can pay, for the bank picker. */
export const GET = apiRoute(async () => {
  // Anyone who keeps a bank account: on a supplier, someone's pay, or a payment.
  await requireAnyPermission("supplier.write", "people.write", "expense.write");
  return NextResponse.json(await listBanks(), { headers: { "Cache-Control": "private, max-age=3600" } });
});
