import { NextResponse } from "next/server";

import { paystackMode } from "@/lib/paystack/client";
import { simulatedCharge } from "@/lib/paystack/simulator";

/** A charge the simulator holds, for its checkout page. Only with the simulator. */
export async function GET(request: Request) {
  if (paystackMode() !== "simulated") return NextResponse.json({ error: "not found" }, { status: 404 });
  const charge = simulatedCharge(new URL(request.url).searchParams.get("reference") ?? "");
  return charge ? NextResponse.json(charge) : NextResponse.json({ error: "not found" }, { status: 404 });
}
