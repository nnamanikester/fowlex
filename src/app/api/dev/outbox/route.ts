import { connection, NextResponse } from "next/server";

import { outbox } from "@/lib/email";

/** The emails "sent" during an e2e run (no Resend key there). Exists only when Playwright runs the app. */
export async function GET() {
  await connection(); // Per request, never built into a static file.
  if (process.env.PLAYWRIGHT !== "1") return new NextResponse(null, { status: 404 });
  return NextResponse.json(outbox());
}
