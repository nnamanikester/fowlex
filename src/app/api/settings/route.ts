import { NextResponse } from "next/server";

import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { updateSettings } from "@/lib/settings/service";

/** Saves the farm's settings (owners only). Answers with the saved values, or the first field error. */
export const PATCH = apiRoute(async (request: Request) => {
  const actor = await requirePermission("settings.manage");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await updateSettings(actor, body));
});
