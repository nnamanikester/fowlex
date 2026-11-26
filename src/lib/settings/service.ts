import "server-only";

import type { ClientSession } from "mongoose";

import { formatInvoiceNumber, type SettingsInput, validateSettings } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { today } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { SKIP_AUDIT } from "@/models/plugins/audit";
import { SettingsModel } from "@/models/settings";

const FIELDS = [
  "businessName",
  "address",
  "phone",
  "email",
  "invoicePrefix",
  "nextInvoiceNumber",
  "paymentTermsDays",
  "vatEnabled",
  "vatRateBps",
  "bankName",
  "accountNumber",
  "accountName",
  "expenseApprovalLimitKobo",
  "defaultPricePerKgKobo",
] as const satisfies readonly (keyof SettingsInput)[];

/** The farm's settings, created with the defaults the first time. */
export async function getSettings(farmId: string) {
  await connectDb();
  const settings = await SettingsModel.findOne({ farmId });
  if (settings) return settings;
  try {
    return await SettingsModel.create({ farmId });
  } catch (error) {
    // Two first reads at once: the other one created it.
    if ((error as { code?: number }).code === 11000) return (await SettingsModel.findOne({ farmId }))!;
    throw error;
  }
}

/** The settings as the form edits them. */
export async function readSettings(farmId: string): Promise<SettingsInput & { overheadMethod: string }> {
  const s = await getSettings(farmId);
  return {
    ...(Object.fromEntries(FIELDS.map((f) => [f, s[f] ?? null])) as unknown as SettingsInput),
    overheadMethod: s.overheadMethod,
  };
}

/** Saves the whole settings form. Refuses with field errors if anything is out of bounds. */
export async function updateSettings(actor: CurrentUser, input: Record<string, unknown>) {
  const values = Object.fromEntries(
    FIELDS.map((f) => [f, typeof input[f] === "string" ? (input[f] as string).trim() : input[f]]),
  );
  if (typeof values.invoicePrefix === "string") values.invoicePrefix = values.invoicePrefix.toUpperCase();
  const errors = validateSettings(values);
  const [field] = Object.keys(errors) as (keyof SettingsInput)[];
  if (field) throw new HttpError(400, "invalid_settings", errors[field]!, field);

  const settings = await getSettings(actor.farmId);
  settings.set(values);
  await settings.save();
  return readSettings(actor.farmId);
}

/**
 * Takes the next invoice number ("INV-2026-0007") in one atomic step, so two invoices created at
 * the same moment never share a number and none is skipped. The prefix in force at that moment is
 * the one used: changing it changes the number on the next invoice.
 */
export async function nextInvoiceNumber(
  farmId: string,
  { now = new Date(), session }: { now?: Date; session?: ClientSession } = {},
) {
  await getSettings(farmId);
  const before = await SettingsModel.findOneAndUpdate(
    { farmId },
    { $inc: { nextInvoiceNumber: 1 } },
    // Each invoice moving the counter isn't a settings change; an owner setting it by hand is.
    { session, returnDocument: "before", ...SKIP_AUDIT },
  ).lean();
  return formatInvoiceNumber(before!.invoicePrefix, today(now).slice(0, 4), before!.nextInvoiceNumber);
}
