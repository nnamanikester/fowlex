// Safe for the browser: no model or database imports here.

/** Equipment that lasts more than a year: its cost is spread over its life, not charged at once. */
export const ASSET_KINDS = [
  "drinkers",
  "feeders",
  "brooders",
  "generator",
  "cages",
  "vehicle",
  "building",
  "other",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  drinkers: "Drinkers",
  feeders: "Feeders",
  brooders: "Brooders and heaters",
  generator: "Generator",
  cages: "Cages",
  vehicle: "Vehicle",
  building: "Building work",
  other: "Other",
};
/** A sensible life to start from, in months. */
export const DEFAULT_LIFE: Record<AssetKind, number> = {
  drinkers: 24,
  feeders: 24,
  brooders: 36,
  generator: 24,
  cages: 60,
  vehicle: 60,
  building: 120,
  other: 36,
};

export const ASSET_STATUSES = ["in-use", "sold", "scrapped"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  "in-use": "In use",
  sold: "Sold",
  scrapped: "Scrapped",
};

export type AssetInput = {
  name: string;
  kind: AssetKind;
  costKobo: number;
  /** What it's worth at the end of its life (scrap or resale); usually 0. */
  salvageKobo: number;
  purchasedOn: string;
  usefulLifeMonths: number;
  notes: string;
};

export const LIMITS = { name: 80, notes: 500, months: 600, kobo: 100_000_000_000 };

/** "2026-11-15" → months since 0 AD, so months can be counted between two dates. */
const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

/**
 * Straight-line depreciation for one month (`YYYY-MM`), in kobo: (cost − salvage) ÷ life, from the
 * month it was bought. Rounding is settled in the last month, so the months add up to cost − salvage
 * exactly. Nothing after its life ends, or after the month it was sold or scrapped.
 */
export function depreciationFor(
  asset: Pick<AssetInput, "costKobo" | "salvageKobo" | "purchasedOn" | "usefulLifeMonths"> & {
    disposedOn?: string | null;
  },
  month: string,
) {
  const n = monthIndex(`${month}-01`) - monthIndex(asset.purchasedOn);
  const life = asset.usefulLifeMonths;
  if (n < 0 || n >= life) return 0;
  if (asset.disposedOn && monthIndex(`${month}-01`) > monthIndex(asset.disposedOn)) return 0;
  const total = Math.max(0, asset.costKobo - asset.salvageKobo);
  const monthly = Math.floor(total / life);
  return n === life - 1 ? total - monthly * (life - 1) : monthly;
}

/** What it's worth at the end of `date`'s month: cost less the depreciation so far. */
export function bookValue(
  asset: Pick<AssetInput, "costKobo" | "salvageKobo" | "purchasedOn" | "usefulLifeMonths"> & {
    disposedOn?: string | null;
  },
  date: string,
) {
  const months = Math.min(asset.usefulLifeMonths, Math.max(0, monthIndex(date) - monthIndex(asset.purchasedOn) + 1));
  let spent = 0;
  for (let i = 0; i < months; i++) {
    const m = monthIndex(asset.purchasedOn) + i;
    spent += depreciationFor(asset, `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`);
  }
  return asset.costKobo - spent;
}

/** The farm's depreciation for a month, from every asset. */
export const monthlyDepreciation = (assets: Parameters<typeof depreciationFor>[0][], month: string) =>
  assets.reduce((sum, a) => sum + depreciationFor(a, month), 0);

export function validateAsset(v: Partial<Record<keyof AssetInput, unknown>>, { today }: { today: string }) {
  const errors: Partial<Record<keyof AssetInput, string>> = {};
  const money = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= LIMITS.kobo;
  if (typeof v.name !== "string" || !v.name.trim()) errors.name = "Name it, like Perkins generator.";
  else if (v.name.length > LIMITS.name) errors.name = `Use at most ${LIMITS.name} characters.`;
  if (!ASSET_KINDS.includes(v.kind as AssetKind)) errors.kind = "Choose what it is.";
  if (!money(v.costKobo) || v.costKobo === 0) errors.costKobo = "Enter what it cost.";
  if (!money(v.salvageKobo)) errors.salvageKobo = "Enter what it'll be worth at the end, or 0.";
  else if (!errors.costKobo && (v.salvageKobo as number) >= (v.costKobo as number))
    errors.salvageKobo = "It should be worth less at the end than it cost.";
  if (typeof v.purchasedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.purchasedOn))
    errors.purchasedOn = "Choose when it was bought.";
  else if (v.purchasedOn > today) errors.purchasedOn = "That's in the future.";
  const life = v.usefulLifeMonths;
  if (typeof life !== "number" || !Number.isInteger(life) || life < 1 || life > LIMITS.months)
    errors.usefulLifeMonths = `Enter how many months it lasts, 1 to ${LIMITS.months}.`;
  if (typeof v.notes !== "string" || v.notes.length > LIMITS.notes)
    errors.notes = `Keep it under ${LIMITS.notes} characters.`;
  return errors;
}
