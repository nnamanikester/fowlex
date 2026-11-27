import { NextResponse } from "next/server";

import { paystackMode } from "@/lib/paystack/client";
import { payCharge } from "@/lib/paystack/simulator";

/**
 * The simulator's customer pays into a transfer account (e2e and trying Fowlex out). Only with
 * the simulator: with real or test keys, money comes through Paystack.
 */
export async function POST(request: Request) {
  if (paystackMode() !== "simulated") return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { reference?: unknown };
  return NextResponse.json({ paid: payCharge(String(body.reference ?? "")) });
}
