import type { BatchView } from "@/lib/batches/service";

/** Batches with birds on the farm to sell, for an order's batch picker. */
export function sellable(batches: BatchView[]) {
  return batches
    .filter((b) => (b.phase === "active" || b.phase === "selling") && b.liveBirds > 0)
    .map((b) => ({
      id: b.id,
      code: b.code,
      liveBirds: b.liveBirds,
      // A bird's weight, for a per-kg order not yet weighed: the last weighing, or the target.
      birdGrams: b.totals.lastWeight?.grams ?? b.targetWeightGrams,
    }));
}
