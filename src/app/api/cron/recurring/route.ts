import { NextResponse } from "next/server";

import { fromCron } from "@/lib/cron";
import { runRecurring } from "@/lib/recurring/service";

/** Daily (vercel.json): makes the monthly expenses that have come due. */
export async function GET(request: Request) {
  if (!fromCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ made: await runRecurring() });
}
