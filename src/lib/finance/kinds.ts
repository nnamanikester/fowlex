// Safe for the browser: no model or database imports here.

/** What a batch's money went on, the same five kinds on every batch. */
export const COST_KINDS = ["chicks", "feed", "medication", "labour", "other"] as const;
export type CostKind = (typeof COST_KINDS)[number];
export const COST_KIND_LABELS: Record<CostKind, string> = {
  chicks: "Chicks",
  feed: "Feed",
  medication: "Drugs and vaccines",
  labour: "Labour",
  other: "Everything else",
};

/** An expense category or a stock item's category, as one of the five kinds. */
export function kindOf(category: string): CostKind {
  if (category === "chicks" || category === "feed" || category === "labour") return category;
  if (category === "medication" || category === "vaccine") return "medication";
  return "other";
}
