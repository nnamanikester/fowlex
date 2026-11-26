/**
 * Stock on hand and what it's worth, replayed from an item's movements (browser-safe). Nothing
 * here is stored, so it can't drift from the movements.
 *
 * Weighted average cost: a purchase (or opening stock, or a count that finds more) adds its units
 * at its own cost; anything taken out (usage, a count that finds less) leaves at the average cost
 * of what was there at the time. Stock can go below zero when usage is logged before the purchase
 * is: those units are costed at the last average, and the item is flagged for a count.
 */
export const MOVEMENT_TYPES = ["opening", "purchase", "usage", "adjustment"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  opening: "Opening stock",
  purchase: "Bought",
  usage: "Used",
  adjustment: "Stock count",
};

export type Movement = {
  id: string;
  type: MovementType;
  date: string;
  /** Units in (positive) or out (negative). */
  quantity: number;
  /** For units coming in: what one cost, in kobo. Ignored for units going out. */
  unitCostKobo: number | null;
  /** Orders movements made on the same day. */
  createdAt: string;
};

export type LedgerRow<M extends Movement = Movement> = M & {
  /** What these units cost (in), or were costed at (out), in kobo. Negative going out. */
  valueKobo: number;
  balance: number;
  balanceValueKobo: number;
};

export type StockLevel = { onHand: number; valueKobo: number; avgCostKobo: number | null };

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Every movement in order, with its cost and the running balance. */
export function ledger<M extends Movement>(movements: M[]): { rows: LedgerRow<M>[]; level: StockLevel } {
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  let onHand = 0;
  let value = 0;
  let avg: number | null = null;
  const rows = sorted.map((m) => {
    let moved: number;
    if (m.quantity >= 0) {
      // In at its own cost; a count that finds more, with no cost given, comes in at the average.
      const unit = m.unitCostKobo ?? avg ?? 0;
      moved = Math.round(m.quantity * unit);
    } else {
      moved = -Math.round(-m.quantity * (avg ?? 0));
    }
    onHand = round(onHand + m.quantity);
    value += moved;
    if (onHand > 0) avg = value / onHand;
    else if (onHand === 0) value = 0;
    return { ...m, valueKobo: moved, balance: onHand, balanceValueKobo: Math.max(0, Math.round(value)) };
  });
  return {
    rows,
    level: {
      onHand,
      valueKobo: onHand > 0 ? Math.round(value) : 0,
      avgCostKobo: avg === null ? null : Math.round(avg),
    },
  };
}

/** Is stock at or under its reorder level? */
export const isLow = (onHand: number, reorderLevel: number | null) => reorderLevel !== null && onHand <= reorderLevel;
