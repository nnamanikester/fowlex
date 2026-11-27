import { NextResponse } from "next/server";

import { apiRoute, requireAnyPermission } from "@/lib/auth/guard";
import { storeUpload } from "@/lib/uploads";

/** Stores a receipt or a signed contract (multipart `file`) and returns where it is. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requireAnyPermission("expense.write", "contract.write");
  const form = await request.formData().catch(() => null);
  return NextResponse.json(await storeUpload(actor.farmId, form?.get("file")), { status: 201 });
});
