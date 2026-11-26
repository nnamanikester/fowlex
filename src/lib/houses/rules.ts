// Safe for the browser: no model or database imports here (the model imports these, not the reverse).
export const HOUSE_STATUSES = ["active", "maintenance", "retired"] as const;
export const HOUSE_SYSTEMS = ["deep-litter", "slatted", "cage"] as const;
export const HOUSE_VENTILATION = ["open-sided", "closed"] as const;

/** What a house form holds; shared by the form and the server. */
export type HouseInput = {
  name: string;
  capacity: number;
  floorAreaSqm: number | null;
  system: (typeof HOUSE_SYSTEMS)[number];
  ventilation: (typeof HOUSE_VENTILATION)[number];
  status: (typeof HOUSE_STATUSES)[number];
  notes: string;
};

export const MAX_CAPACITY = 1_000_000;

export const SYSTEM_LABELS: Record<HouseInput["system"], string> = {
  "deep-litter": "Deep litter",
  slatted: "Slatted floor",
  cage: "Cages",
};
export const VENTILATION_LABELS: Record<HouseInput["ventilation"], string> = {
  "open-sided": "Open-sided",
  closed: "Closed (fans, cooling)",
};
export const STATUS_LABELS: Record<HouseInput["status"], string> = {
  active: "In use",
  maintenance: "Under maintenance",
  retired: "Retired",
};

/** "  House   1 " → "House 1". */
export const tidyName = (name: string) => name.trim().replace(/\s+/g, " ");
/** The name as uniqueness sees it: "House 1" and "house  1" are the same house. */
export const nameKey = (name: string) => tidyName(name).toLowerCase();

/** Birds a floor area holds at a stocking density (birds per m²), rounded down. */
export function suggestedCapacity(floorAreaSqm: number | null, density: number) {
  if (!floorAreaSqm || floorAreaSqm <= 0 || !Number.isFinite(floorAreaSqm)) return null;
  return Math.floor(floorAreaSqm * density);
}

/** Field → message for anything wrong; empty when fine. */
export function validateHouse(input: Partial<Record<keyof HouseInput, unknown>>) {
  const errors: Partial<Record<keyof HouseInput, string>> = {};
  const name = typeof input.name === "string" ? tidyName(input.name) : "";
  if (!name) errors.name = "Give the house a name, like House 1.";
  else if (name.length > 40) errors.name = "Use at most 40 characters.";

  const capacity = input.capacity;
  if (typeof capacity !== "number" || !Number.isSafeInteger(capacity) || capacity < 1)
    errors.capacity = "Enter how many birds it holds, as a whole number.";
  else if (capacity > MAX_CAPACITY) errors.capacity = `Use at most ${MAX_CAPACITY.toLocaleString("en-NG")} birds.`;

  const area = input.floorAreaSqm;
  if (
    area !== null &&
    area !== undefined &&
    (typeof area !== "number" || !Number.isFinite(area) || area <= 0 || area > 100_000)
  )
    errors.floorAreaSqm = "Enter the floor area in m², or leave it empty.";

  if (!HOUSE_SYSTEMS.includes(input.system as never)) errors.system = "Choose how the birds are kept.";
  if (!HOUSE_VENTILATION.includes(input.ventilation as never)) errors.ventilation = "Choose open-sided or closed.";
  if (!HOUSE_STATUSES.includes(input.status as never)) errors.status = "Choose a status.";
  if (typeof input.notes !== "string") errors.notes = "Enter text.";
  else if (input.notes.length > 500) errors.notes = "Use at most 500 characters.";
  return errors;
}
