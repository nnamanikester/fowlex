import { NextResponse } from "next/server";

import { handleWebhook, validSignature } from "@/lib/paystack/webhook";

/**
 * Paystack's webhook. Checked by signature (no session), handled once per event, and answered
 * 200 quickly; a 500 makes Paystack try again later.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-paystack-signature")))
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  try {
    return NextResponse.json({ result: await handleWebhook(payload) });
  } catch {
    return NextResponse.json({ error: "try again" }, { status: 500 });
  }
}
