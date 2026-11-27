import { NextResponse } from "next/server";

import { fromCron } from "@/lib/cron";
import { sendLowStockAlerts } from "@/lib/inventory/alerts";

/** Daily (vercel.json): emails owners about items that have just run low. Vercel sends CRON_SECRET. */
export async function GET(request: Request) {
  if (!fromCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ sent: await sendLowStockAlerts(new URL(request.url).origin) });
}
