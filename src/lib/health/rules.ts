import { addDays, isISODate } from "@/lib/dates";

/** What happened: a vaccine, a drug, or the vet. */
export const HEALTH_KINDS = ["vaccination", "medication", "vet-visit"] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number];
export const KIND_LABELS: Record<HealthKind, string> = {
  vaccination: "Vaccination",
  medication: "Medication",
  "vet-visit": "Vet visit",
};

export const ROUTES = ["Drinking water", "Eye drop", "Spray", "Injection", "Feed"] as const;

/** One dose in a vaccination programme, given on a day of age. */
export type ScheduleItem = { key: string; day: number; vaccine: string; disease: string; route: string };

/**
 * The common Nigerian broiler programme (Newcastle and Gumboro, the two diseases that kill most
 * broilers here). Marek's is given at the hatchery, so it isn't listed.
 */
export const BROILER_SCHEDULE: ScheduleItem[] = [
  { key: "nd-1", day: 7, vaccine: "Newcastle (Lasota or B1)", disease: "Newcastle disease", route: "Eye drop" },
  { key: "ibd-1", day: 14, vaccine: "Gumboro (IBD)", disease: "Gumboro", route: "Drinking water" },
  { key: "nd-2", day: 21, vaccine: "Newcastle Lasota booster", disease: "Newcastle disease", route: "Drinking water" },
  { key: "ibd-2", day: 24, vaccine: "Gumboro booster", disease: "Gumboro", route: "Drinking water" },
];

const SCHEDULES: Record<string, ScheduleItem[]> = {};
/** The programme for a breed. Every broiler breed on the list follows the same one for now. */
export const scheduleFor = (breed: string) => SCHEDULES[breed] ?? BROILER_SCHEDULE;

/** A dose may be given a day early, and is overdue two days after its day. */
export const WINDOW = { early: 1, late: 2 };

export type DoseState = "given" | "due" | "overdue" | "upcoming" | "before-arrival";
export type Dose = ScheduleItem & { state: DoseState; dueOn: string; givenOn: string | null };

/**
 * Where a batch is in its programme. `given` maps schedule keys to the day each was given. A dose
 * due before the chicks arrived (started birds) is the hatchery's or seller's, never overdue here.
 * A closed batch has nothing due.
 */
export function vaccinationPlan(
  batch: { breed: string; placedOn: string; ageAtPlacementDays: number; status: string },
  given: Map<string, string>,
  today: string,
): Dose[] {
  const day0 = addDays(batch.placedOn, -batch.ageAtPlacementDays);
  const age = Math.round((Date.parse(today) - Date.parse(day0)) / 86_400_000);
  return scheduleFor(batch.breed).map((item) => {
    const dueOn = addDays(day0, item.day);
    const givenOn = given.get(item.key) ?? null;
    const state: DoseState = givenOn
      ? "given"
      : item.day < batch.ageAtPlacementDays
        ? "before-arrival"
        : batch.status === "closed" || age < item.day - WINDOW.early
          ? "upcoming"
          : age > item.day + WINDOW.late
            ? "overdue"
            : "due";
    return { ...item, state, dueOn, givenOn };
  });
}

/** The doses that need doing now, most urgent first. */
export const needsAttention = (plan: Dose[]) =>
  plan.filter((d) => d.state === "overdue" || d.state === "due").sort((a, b) => a.day - b.day);

export type HealthInput = {
  batchId: string;
  date: string;
  kind: HealthKind;
  product: string;
  scheduleKey: string | null;
  route: string;
  dose: string;
  givenBy: string;
  costKobo: number;
  withdrawalDays: number;
  notes: string;
};

export const LIMITS = { text: 120, notes: 500, costKobo: 10_000_000_000, withdrawalDays: 90 };

/** The last day birds can't go for sale or slaughter after a drug, if any. */
export const withdrawalEnds = (e: Pick<HealthInput, "date" | "withdrawalDays">) =>
  e.withdrawalDays > 0 ? addDays(e.date, e.withdrawalDays) : null;

export function validateHealth(
  v: Record<keyof HealthInput, unknown>,
  { today, placedOn }: { today: string; placedOn?: string },
): Partial<Record<keyof HealthInput, string>> {
  const errors: Partial<Record<keyof HealthInput, string>> = {};
  const text = (field: keyof HealthInput, max: number, required = false) => {
    const value = v[field];
    if (typeof value !== "string") errors[field] = "Enter text.";
    else if (required && !value.trim()) errors[field] = "Required.";
    else if (value.length > max) errors[field] = `Keep it under ${max} characters.`;
  };
  if (typeof v.batchId !== "string" || !v.batchId) errors.batchId = "Choose a batch.";
  if (typeof v.date !== "string" || !isISODate(v.date)) errors.date = "Enter a date.";
  else if (v.date > today) errors.date = "That's in the future.";
  else if (placedOn && v.date < placedOn) errors.date = "That's before the chicks were placed.";
  if (!HEALTH_KINDS.includes(v.kind as HealthKind)) errors.kind = "Choose what happened.";
  text("product", LIMITS.text, v.kind !== "vet-visit");
  if (
    v.kind === "vet-visit" &&
    typeof v.product === "string" &&
    !v.product.trim() &&
    typeof v.notes === "string" &&
    !v.notes.trim()
  )
    errors.notes = "Say what the vet found or did.";
  if (v.scheduleKey !== null && (v.kind !== "vaccination" || typeof v.scheduleKey !== "string"))
    errors.scheduleKey = "Only a vaccination can count towards the programme.";
  text("route", LIMITS.text);
  text("dose", LIMITS.text);
  text("givenBy", LIMITS.text);
  text("notes", LIMITS.notes);
  if (typeof v.costKobo !== "number" || !Number.isInteger(v.costKobo) || v.costKobo < 0 || v.costKobo > LIMITS.costKobo)
    errors.costKobo = "Enter what it cost, or leave it at 0.";
  if (
    typeof v.withdrawalDays !== "number" ||
    !Number.isInteger(v.withdrawalDays) ||
    v.withdrawalDays < 0 ||
    v.withdrawalDays > LIMITS.withdrawalDays
  )
    errors.withdrawalDays = `Enter whole days, 0 to ${LIMITS.withdrawalDays}.`;
  return errors;
}

/** The latest day a drug still in the birds keeps them from sale, if it's today or later. */
export function withdrawalUntil(events: Pick<HealthInput, "date" | "withdrawalDays">[], today: string) {
  const ends = events.map(withdrawalEnds).filter((d): d is string => d !== null && d >= today);
  return ends.length ? ends.sort().at(-1)! : null;
}
