import { NextResponse } from "next/server";

import { apiRoute, HttpError, requirePermission } from "@/lib/auth/guard";
import { connectDb } from "@/lib/db";
import { syncPayout } from "@/lib/payouts/service";
import { PayoutModel } from "@/models/payout";

/** Asks Paystack where a transfer is now, and updates it. */
export const POST = apiRoute(async (_request: Request, context: RouteContext<"/api/payouts/[id]/check">) => {
  const actor = await requirePermission("payout.send");
  await connectDb();
  const id = (await context.params).id;
  const payout = /^[a-f\d]{24}$/i.test(id) ? await PayoutModel.findOne({ _id: id, farmId: actor.farmId }).lean() : null;
  if (!payout) throw new HttpError(404, "not_found", "That transfer doesn't exist any more.");
  return NextResponse.json(await syncPayout(payout.reference));
});
