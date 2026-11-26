import type { BatchSummary } from "@/lib/workspace";

/**
 * Stand-in batches so the shell can be built before the Batch model exists. Step 2.2 replaces
 * PREVIEW_BATCHES with real batches. Nothing else should import this file.
 */
export const PREVIEW_BATCHES: BatchSummary[] = [
  { id: "b-2026-07", code: "B-2026-07", house: "House 1", status: "active", day: 24, liveBirds: 785 },
  { id: "b-2026-08", code: "B-2026-08", house: "House 2", status: "active", day: 10, liveBirds: 1_190 },
  { id: "b-2026-06", code: "B-2026-06", house: "House 3", status: "selling", day: 41, liveBirds: 810 },
];
