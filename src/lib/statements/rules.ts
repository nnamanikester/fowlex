// Safe for the browser: no model or database imports here.

/** Days past due, in four bands: up to 30 (including not yet due), 31–60, 61–90 and over 90. */
export const AGING_BANDS = ["0-30", "31-60", "61-90", "90+"] as const;
export type AgingBand = (typeof AGING_BANDS)[number];
export const AGING_LABELS: Record<AgingBand, string> = {
  "0-30": "Up to 30 days",
  "31-60": "31 to 60 days",
  "61-90": "61 to 90 days",
  "90+": "Over 90 days",
};

/** Which band an amount due on `dueDate` falls in on `today`. */
export function agingBand(dueDate: string, today: string): AgingBand {
  const late = Math.round((Date.parse(today) - Date.parse(dueDate)) / 86_400_000);
  return late <= 30 ? "0-30" : late <= 60 ? "31-60" : late <= 90 ? "61-90" : "90+";
}
