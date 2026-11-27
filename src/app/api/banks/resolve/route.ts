import { NextResponse } from "next/server";

import { apiRoute, requireAnyPermission } from "@/lib/auth/guard";
import { resolveAccount } from "@/lib/paystack/banks";

/** The name on an account (`?accountNumber=…&bankCode=…`), as the bank has it. */
export const GET = apiRoute(async (request: Request) => {
  // Anyone who keeps a bank account: on a supplier, someone's pay, or a payment.
  await requireAnyPermission("supplier.write", "people.write", "expense.write");
  const url = new URL(request.url);
  return NextResponse.json(
    await resolveAccount(url.searchParams.get("accountNumber"), url.searchParams.get("bankCode")),
  );
});
