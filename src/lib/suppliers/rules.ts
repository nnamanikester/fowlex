// Safe for the browser: no model or database imports here.

/** What a supplier sells or does for the farm. */
export const SUPPLIES = [
  "chicks",
  "feed",
  "drugs",
  "equipment",
  "litter",
  "fuel",
  "transport",
  "services",
  "other",
] as const;
export type Supply = (typeof SUPPLIES)[number];
export const SUPPLY_LABELS: Record<Supply, string> = {
  chicks: "Day-old chicks",
  feed: "Feed",
  drugs: "Drugs and vaccines",
  equipment: "Equipment",
  litter: "Litter",
  fuel: "Fuel",
  transport: "Transport",
  services: "Services (vet, labour…)",
  other: "Other",
};

/** A bank account checked with the bank: the name is the bank's, never typed. */
export type BankAccount = { bankCode: string; bankName: string; accountNumber: string; accountName: string };

export type SupplierInput = {
  name: string;
  supplies: Supply[];
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  bank: BankAccount | null;
};

export const LIMITS = { name: 80, text: 120, address: 300, notes: 500 };

export const tidyName = (name: string) => name.trim().replace(/\s+/g, " ");
export const nameKey = (name: string) => tidyName(name).toLowerCase();

/** "0803 123 4567", "+234 803…", "234803…" → "+2348031234567"; null if it isn't a Nigerian number. */
export function normalisePhone(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  const local = digits.replace(/^\+?234/, "0");
  return /^0[789][01]\d{8}$/.test(local) ? `+234${local.slice(1)}` : null;
}
/** "+2348031234567" → "0803 123 4567". */
export const formatPhone = (phone: string) =>
  /^\+234\d{10}$/.test(phone) ? `0${phone.slice(4, 7)} ${phone.slice(7, 10)} ${phone.slice(10)}` : phone;

/** "0123456789" → "••••6789". */
export const maskAccount = (number: string) => `••••${number.slice(-4)}`;

const POPULAR = ["opay", "moniepoint", "palmpay", "guaranty", "access", "zenith", "first bank", "united bank", "kuda"];
/** Banks most farm suppliers use come first, then the rest A to Z. */
export function sortBanks<B extends { name: string }>(banks: B[]) {
  const rank = (b: B) => {
    const i = POPULAR.findIndex((p) => b.name.toLowerCase().includes(p));
    return i < 0 ? POPULAR.length : i;
  };
  return [...banks].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
export const isPopular = (name: string) => POPULAR.some((p) => name.toLowerCase().includes(p));

export function validateSupplier(v: Partial<Record<keyof SupplierInput, unknown>>) {
  const errors: Partial<Record<keyof SupplierInput, string>> = {};
  const name = typeof v.name === "string" ? tidyName(v.name) : "";
  if (!name) errors.name = "Enter the supplier's name.";
  else if (name.length > LIMITS.name) errors.name = `Use at most ${LIMITS.name} characters.`;
  if (!Array.isArray(v.supplies) || v.supplies.some((s) => !SUPPLIES.includes(s as Supply)))
    errors.supplies = "Choose what they supply.";
  for (const field of ["contactName", "email"] as const) {
    const value = v[field];
    if (typeof value !== "string" || value.length > LIMITS.text)
      errors[field] = `Use at most ${LIMITS.text} characters.`;
  }
  if (!errors.email && v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email as string))
    errors.email = "Enter a valid email.";
  if (typeof v.phone !== "string") errors.phone = "Enter a phone number.";
  else if (v.phone && !normalisePhone(v.phone)) errors.phone = "Enter a Nigerian number, like 0803 123 4567.";
  if (typeof v.address !== "string" || v.address.length > LIMITS.address) errors.address = "Keep it shorter.";
  if (typeof v.notes !== "string" || v.notes.length > LIMITS.notes)
    errors.notes = `Keep it under ${LIMITS.notes} characters.`;
  const bank = v.bank as BankAccount | null | undefined;
  if (bank !== null && bank !== undefined) {
    if (typeof bank !== "object" || !/^\d{10}$/.test(String(bank.accountNumber)) || !bank.bankCode)
      errors.bank = "Check the bank account.";
  }
  return errors;
}
