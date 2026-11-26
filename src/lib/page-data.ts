import "server-only";

import { cacheLife } from "next/cache";

import { listAudit } from "@/lib/audit/service";
import { batchSummaries, getBatch, listBatches } from "@/lib/batches/service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { listHouses } from "@/lib/houses/service";
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

async function housesCached(farmId: string) {
  "use cache: private";
  cacheLife("session");
  return listHouses(farmId);
}

async function batchesCached(farmId: string) {
  "use cache: private";
  cacheLife("session");
  return listBatches(farmId);
}

async function batchCached(farmId: string, id: string) {
  "use cache: private";
  cacheLife("session");
  return getBatch(farmId, id);
}

async function summariesCached(farmId: string) {
  "use cache: private";
  cacheLife("session");
  return batchSummaries(farmId);
}

export const loadBatches = PRODUCTION ? batchesCached : (farmId: string) => listBatches(farmId);
export const loadBatch = PRODUCTION ? batchCached : (farmId: string, id: string) => getBatch(farmId, id);
export const loadBatchSummaries = PRODUCTION ? summariesCached : (farmId: string) => batchSummaries(farmId);
export const loadHouses: typeof listHouses = PRODUCTION ? housesCached : listHouses;
export const loadSettings: typeof readSettings = PRODUCTION ? settingsCached : readSettings;
export const loadTeam: typeof listTeam = PRODUCTION ? teamCached : listTeam;
export const loadAudit: (actor: CurrentUser) => ReturnType<typeof listAudit> = PRODUCTION
  ? auditCached
  : (actor) => listAudit(actor);
