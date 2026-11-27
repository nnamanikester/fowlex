import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { createContract, listContracts } from "@/lib/contracts/service";

/** Contracts, or one customer's (`?customerId=`). */
export const GET = apiRoute(async (request: Request) => {
  const actor = await requirePermission("contract.read");
  const customerId = new URL(request.url).searchParams.get("customerId") ?? undefined;
  return NextResponse.json(await listContracts(actor.farmId, { customerId }));
});

/** Writes a contract: a draft, or active at once (`activate: true`). */
export const POST = apiRoute(async (request: Request) => {
  const actor = await requirePermission("contract.write");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createContract(actor, body), { status: 201 });
});
