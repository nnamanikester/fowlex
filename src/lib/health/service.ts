import "server-only";

import { Types } from "mongoose";

import { type HealthInput, scheduleFor, validateHealth } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { BatchModel } from "@/models/batch";
import { HealthEventModel } from "@/models/health-event";

export type HealthView = HealthInput & { id: string; version: number };

type Doc = Omit<HealthInput, "batchId"> & { _id: unknown; __v?: number; batchId: unknown };
const view = (e: Doc): HealthView => ({
  id: String(e._id),
  version: e.__v ?? 0,
  batchId: String(e.batchId),
  date: e.date,
  kind: e.kind,
  product: e.product ?? "",
  scheduleKey: e.scheduleKey ?? null,
  route: e.route ?? "",
  dose: e.dose ?? "",
  givenBy: e.givenBy ?? "",
  costKobo: e.costKobo ?? 0,
  withdrawalDays: e.withdrawalDays ?? 0,
  notes: e.notes ?? "",
});

/** A batch's health record, newest first. */
export async function listHealth(farmId: string, batchId: string): Promise<HealthView[]> {
  await connectDb();
  if (!Types.ObjectId.isValid(batchId)) return [];
  const events = await HealthEventModel.find({ farmId, batchId }).sort({ date: -1, createdAt: -1 }).lean();
  return events.map((e) => view(e as unknown as Doc));
}

function clean(input: Record<string, unknown>) {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : (v ?? ""));
  return {
    batchId: input.batchId,
    date: input.date,
    kind: input.kind,
    product: text(input.product),
    scheduleKey: input.scheduleKey === "" || input.scheduleKey === undefined ? null : input.scheduleKey,
    route: text(input.route),
    dose: text(input.dose),
    givenBy: text(input.givenBy),
    costKobo: input.costKobo === "" || input.costKobo == null ? 0 : input.costKobo,
    withdrawalDays: input.withdrawalDays === "" || input.withdrawalDays == null ? 0 : input.withdrawalDays,
    notes: text(input.notes),
  } as Record<keyof HealthInput, unknown>;
}

async function openBatch(farmId: string, batchId: unknown) {
  const batch =
    typeof batchId === "string" && Types.ObjectId.isValid(batchId)
      ? await BatchModel.findOne({ _id: batchId, farmId }).lean()
      : null;
  if (!batch) throw new HttpError(400, "invalid_health", "Choose a batch on the farm.", "batchId");
  if (batch.status === "closed")
    throw new HttpError(409, "closed", `${batch.code} is closed, so its health record can't change.`);
  if (batch.pickedUp === false)
    throw new HttpError(409, "not_picked_up", `${batch.code}'s chicks haven't been picked up yet.`);
  return batch;
}

function check(values: Record<keyof HealthInput, unknown>, batch: { placedOn: string; breed: string }, today: string) {
  const errors = validateHealth(values, { today, placedOn: batch.placedOn });
  if (
    !errors.scheduleKey &&
    typeof values.scheduleKey === "string" &&
    !scheduleFor(batch.breed).some((s) => s.key === values.scheduleKey)
  )
    errors.scheduleKey = "That dose isn't in this batch's programme.";
  const [field] = Object.keys(errors) as (keyof HealthInput)[];
  if (field) throw new HttpError(400, "invalid_health", errors[field]!, field);
  return values as unknown as HealthInput;
}

const alreadyGiven = (id: string) =>
  new HttpError(409, "already_given", "That dose is already recorded for this batch.", "scheduleKey", { id });

/** Records a vaccination, medication or vet visit. A resent request returns the saved one. */
export async function createHealthEvent(
  actor: CurrentUser,
  input: Record<string, unknown>,
  { requestId }: { requestId?: string } = {},
  today = lagosToday(),
): Promise<{ event: HealthView; created: boolean }> {
  await connectDb();
  const id = typeof requestId === "string" && /^[\w-]{8,64}$/.test(requestId) ? requestId : null;
  if (id) {
    const sent = await HealthEventModel.findOne({ farmId: actor.farmId, clientRequestId: id }).lean();
    if (sent) return { event: view(sent as unknown as Doc), created: false };
  }
  const values = clean(input);
  const batch = await openBatch(actor.farmId, values.batchId);
  const event = check(values, batch, today);
  if (event.scheduleKey) {
    const given = await HealthEventModel.findOne({ batchId: batch._id, scheduleKey: event.scheduleKey }).lean();
    // The same record, sent again while the first copy was being saved.
    if (given && id && given.clientRequestId === id) return { event: view(given as unknown as Doc), created: false };
    if (given) throw alreadyGiven(String(given._id));
  }
  try {
    const doc = await HealthEventModel.create({
      ...event,
      farmId: actor.farmId,
      createdBy: actor.id,
      clientRequestId: id,
    });
    return { event: view(doc.toObject() as unknown as Doc), created: true };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const sent = id ? await HealthEventModel.findOne({ farmId: actor.farmId, clientRequestId: id }).lean() : null;
    if (sent) return { event: view(sent as unknown as Doc), created: false };
    const given = await HealthEventModel.findOne({ batchId: batch._id, scheduleKey: event.scheduleKey }).lean();
    throw alreadyGiven(String(given?._id ?? ""));
  }
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const event = Types.ObjectId.isValid(id) ? await HealthEventModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!event) throw new HttpError(404, "not_found", "That health record doesn't exist any more.");
  return event;
}

const stale = () => new HttpError(409, "stale", "Someone changed this record while you were editing. Open it again.");

/** Changes a health record from a form no older than the last save. */
export async function updateHealthEvent(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  version: unknown,
  today = lagosToday(),
): Promise<HealthView> {
  const doc = await load(actor, id);
  const batch = await openBatch(actor.farmId, String(doc.batchId));
  if (typeof version !== "number" || version !== doc.__v) throw stale();
  const event = check(clean({ ...input, batchId: String(doc.batchId) }), batch, today);
  if (event.scheduleKey && event.scheduleKey !== doc.scheduleKey) {
    const given = await HealthEventModel.findOne({ batchId: batch._id, scheduleKey: event.scheduleKey }).lean();
    if (given) throw alreadyGiven(String(given._id));
  }
  doc.set({ ...event, batchId: batch._id });
  try {
    await doc.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return view(doc.toObject() as unknown as Doc);
}

/** Removes a health record (kept, hidden and audited). Not on a closed batch. */
export async function deleteHealthEvent(actor: CurrentUser, id: string) {
  const doc = await load(actor, id);
  await openBatch(actor.farmId, String(doc.batchId));
  await doc.softDelete();
}
