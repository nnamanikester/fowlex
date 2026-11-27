import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { activateContract } from "@/lib/contracts/service";

/** A draft is agreed: it starts setting the customer's prices. */
export const POST = apiRoute(async (_request: Request, context: RouteContext<"/api/contracts/[id]/activate">) => {
  const actor = await requirePermission("contract.write");
  return NextResponse.json(await activateContract(actor, (await context.params).id));
});
