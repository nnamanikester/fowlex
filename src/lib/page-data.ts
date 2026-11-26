import "server-only";

import { cacheLife } from "next/cache";

import { listAudit } from "@/lib/audit/service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { readSettings } from "@/lib/settings/service";
import { listTeam } from "@/lib/users/service";

/**
 * What pages read, private-cached in production like the signed-in user (see getCurrentUser): one
 * database read per request instead of one per render pass, and instant moves back to a page in
 * the browser for 30 s. After a change, router.refresh() fetches fresh data from the server, which
 * never stores it. Development reads fresh every time.
 */
const PRODUCTION = process.env.NODE_ENV === "production";

async function settingsCached(farmId: string) {
  "use cache: private";
  cacheLife("session");
  return readSettings(farmId);
}

async function teamCached(actor: CurrentUser) {
  "use cache: private";
  cacheLife("session");
  return listTeam(actor);
}

async function auditCached(actor: CurrentUser) {
  "use cache: private";
  cacheLife("session");
  return listAudit(actor);
}

export const loadSettings: typeof readSettings = PRODUCTION ? settingsCached : readSettings;
export const loadTeam: typeof listTeam = PRODUCTION ? teamCached : listTeam;
export const loadAudit: (actor: CurrentUser) => ReturnType<typeof listAudit> = PRODUCTION
  ? auditCached
  : (actor) => listAudit(actor);
