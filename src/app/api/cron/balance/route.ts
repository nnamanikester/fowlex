import { NextResponse } from "next/server";

import { fromCron } from "@/lib/cron";
import { syncAllBalances } from "@/lib/balance/service";

/** Daily (vercel.json), besides every webhook and page visit: brings each farm's Paystack book up to date. */
export async function GET(request: Request) {
  if (!fromCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ synced: await syncAllBalances() });
}
