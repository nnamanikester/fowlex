import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { sendLowStockAlerts } from "@/lib/inventory/alerts";

/** Daily (vercel.json): emails owners about items that have just run low. Vercel sends CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ sent: await sendLowStockAlerts(new URL(request.url).origin) });
}
