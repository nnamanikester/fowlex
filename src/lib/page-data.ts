import "server-only";

import { cacheLife } from "next/cache";

import { listAudit } from "@/lib/audit/service";
import { batchSummaries, getBatch, listBatches } from "@/lib/batches/service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { listExpenses, supplierBalances } from "@/lib/expenses/service";
import { listHouses } from "@/lib/houses/service";
import { listItems } from "@/lib/inventory/items";
import { listMovements } from "@/lib/inventory/movements";
import { listLogs } from "@/lib/logs/service";
import { listSuppliers } from "@/lib/suppliers/service";
import { listHealth } from "@/lib/health/service";
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
async function logsCached(farmId: string, batchId: string) {
  "use cache: private";
  cacheLife("session");
  return listLogs(farmId, batchId);
}

async function healthCached(farmId: string, batchId: string) {
  "use cache: private";
  cacheLife("session");
  return listHealth(farmId, batchId);
}

export const loadHealth = PRODUCTION ? healthCached : (farmId: string, batchId: string) => listHealth(farmId, batchId);
async function itemsCached(farmId: string) {
  "use cache: private";
  cacheLife("session");
  return listItems(farmId);
}

async function movementsCached(farmId: string, itemId: string) {
  "use cache: private";
  cacheLife("session");
  return listMovements(farmId, itemId);
}

export const loadMovements = PRODUCTION
  ? movementsCached
  : (farmId: string, itemId: string) => listMovements(farmId, itemId);
async function suppliersCached(farmId: string) {
  "use cache: private";
  cacheLife("session");
  return listSuppliers(farmId);
}

export const loadSuppliers = PRODUCTION ? suppliersCached : (farmId: string) => listSuppliers(farmId);
async function expensesCached(farmId: string) {
  "use cache: private";
  cacheLife("session");
  return listExpenses(farmId);
}

export const loadExpenses = PRODUCTION ? expensesCached : (farmId: string) => listExpenses(farmId);

async function balancesCached(farmId: string) {
  "use cache: private";
  cacheLife("session");
  // A Map doesn't survive the cache: hand back its entries.
  return [...(await supplierBalances(farmId))];
}

/** What each supplier is owed, by supplier id. */
export const loadSupplierBalances = async (farmId: string) =>
  new Map(PRODUCTION ? await balancesCached(farmId) : await supplierBalances(farmId));
export const loadItems = PRODUCTION ? itemsCached : (farmId: string) => listItems(farmId);
export const loadLogs = PRODUCTION ? logsCached : (farmId: string, batchId: string) => listLogs(farmId, batchId);
export const loadHouses: typeof listHouses = PRODUCTION ? housesCached : listHouses;
export const loadSettings: typeof readSettings = PRODUCTION ? settingsCached : readSettings;
export const loadTeam: typeof listTeam = PRODUCTION ? teamCached : listTeam;
export const loadAudit: (actor: CurrentUser) => ReturnType<typeof listAudit> = PRODUCTION
  ? auditCached
  : (actor) => listAudit(actor);
