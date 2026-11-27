import "server-only";

import { timingSafeEqual } from "node:crypto";

/** True when a request carries Vercel's cron secret (`Authorization: Bearer $CRON_SECRET`). */
export function fromCron(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return !!secret && given.length === expected.length && timingSafeEqual(given, expected);
}
