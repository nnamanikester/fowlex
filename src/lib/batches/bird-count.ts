/**
 * Birds still in the house: placed, less every death, cull and bird sold. Worked out from the
 * logs every time and never stored, so it can't drift from them. Never below zero.
 */
export type BirdCounts = { placed: number; deaths: number; culls: number; sold: number };

export const liveBirds = ({ placed, deaths, culls, sold }: BirdCounts) => Math.max(0, placed - deaths - culls - sold);

/** Birds removed so far by death, culling or sale. */
export const removedBirds = ({ deaths, culls, sold }: Omit<BirdCounts, "placed">) => deaths + culls + sold;
