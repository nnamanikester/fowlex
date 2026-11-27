import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { resolveAccount } from "@/lib/paystack/banks";

/** The name on an account (`?accountNumber=…&bankCode=…`), as the bank has it. */
export const GET = apiRoute(async (request: Request) => {
  await requirePermission("supplier.write");
  const url = new URL(request.url);
  return NextResponse.json(
    await resolveAccount(url.searchParams.get("accountNumber"), url.searchParams.get("bankCode")),
  );
});
