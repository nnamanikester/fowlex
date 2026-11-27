import { NextResponse } from "next/server";

import { fromCron } from "@/lib/cron";
import { sendEndingWarnings } from "@/lib/contracts/service";

/** Daily (vercel.json): warns owners and sales about contracts ending within 30 days. Vercel sends CRON_SECRET. */
export async function GET(request: Request) {
  if (!fromCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ warned: await sendEndingWarnings(new URL(request.url).origin) });
}
