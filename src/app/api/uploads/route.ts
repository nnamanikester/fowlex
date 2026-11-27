import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { storeUpload } from "@/lib/uploads";

/** Stores a receipt (multipart `file`) and returns where it is. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("expense.write");
  const form = await request.formData().catch(() => null);
  return NextResponse.json(await storeUpload(actor.farmId, form?.get("file")), { status: 201 });
});
