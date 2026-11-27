import { NextResponse } from "next/server";

import { apiRoute, requireSession } from "@/lib/auth/guard";
import { portalHome } from "@/lib/portal/service";

/** What a signed-in customer sees: what they owe, their invoices, orders and contracts. */
export const GET = apiRoute(async () => NextResponse.json(await portalHome(await requireSession())));
