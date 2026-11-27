// Safe for the browser: no model or database imports here.
import { addDays } from "@/lib/dates";
import { normalisePhone } from "@/lib/suppliers/rules";

/** A slug for the page's address from the farm's name: "Fowlex Farms" → "fowlex-farms". */
export const slugFrom = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "farm";

/** How many days ahead customers can choose. */
export const ORDER_DAYS = 14;
/** A batch is offered from this many days before its target selling age: birds are at weight by then. */
export const READY_EARLY_DAYS = 7;
export const MAX_BIRDS = 100_000;

/** The first day a batch's birds can be sold. */
export const readyOn = (placedOn: string, targetSellAgeDays: number, today: string) => {
  const day = addDays(placedOn, Math.max(0, targetSellAgeDays - READY_EARLY_DAYS));
  return day < today ? today : day;
};

export type OnlineOrderInput = {
  birds: number;
  date: string;
  delivery: boolean;
  name: string;
  phone: string;
  email: string;
  business: string;
  address: string;
  notes: string;
};

/** Checks the order form: plain messages for each field, in the order a person fills it in. */
export function validateOnlineOrder(v: Partial<Record<keyof OnlineOrderInput, unknown>>, { delivers = true } = {}) {
  const errors: Partial<Record<keyof OnlineOrderInput, string>> = {};
  const birds = v.birds;
  if (typeof birds !== "number" || !Number.isInteger(birds) || birds < 1)
    errors.birds = "Choose how many birds you want.";
  else if (birds > MAX_BIRDS)
    errors.birds = `That's more than we can take in one order: call us for over ${MAX_BIRDS.toLocaleString("en-NG")}.`;
  if (typeof v.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) errors.date = "Choose a day.";
  if (typeof v.delivery !== "boolean") errors.delivery = "Choose pick up or delivery.";
  else if (v.delivery && !delivers) errors.delivery = "We don't deliver: choose pick up.";
  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (name.length < 2) errors.name = "Enter your name.";
  else if (name.length > 80) errors.name = "Use at most 80 characters.";
  if (typeof v.phone !== "string" || !normalisePhone(v.phone))
    errors.phone = "Enter your phone number, like 0803 123 4567.";
  if (typeof v.email !== "string") errors.email = "Enter your email, or leave it empty.";
  else if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errors.email = "Check your email.";
  if (typeof v.business !== "string" || v.business.length > 120) errors.business = "Use at most 120 characters.";
  const address = typeof v.address === "string" ? v.address.trim() : "";
  if (v.delivery === true && address.length < 5) errors.address = "Enter where we should deliver.";
  else if (address.length > 300) errors.address = "Keep it shorter.";
  if (typeof v.notes !== "string" || v.notes.length > 500) errors.notes = "Keep it under 500 characters.";
  return errors;
}

/** "Sat 30 Nov", or Today and Tomorrow. */
export function dayLabel(day: string, today: string) {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}
