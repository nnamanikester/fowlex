import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createSupplier, listSuppliers } from "@/lib/suppliers/service";

/** The farm's suppliers. */
export const GET = apiRoute(async () => {
  const actor = await requirePermission("supplier.read");
  return NextResponse.json(await listSuppliers(actor.farmId));
});

/** Adds a supplier; a bank account is checked with the bank first. */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("supplier.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createSupplier(actor, body), { status: 201 });
});
