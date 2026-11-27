import "server-only";

import type { Types } from "mongoose";

import {
  ageOn,
  type BatchInput,
  chickCostKobo,
  daysBetween,
  paidCount,
  type Phase,
  shortfall,
  phaseOf,
  placedCount,
  validateBatch,
} from "./rules";
import { liveBirds, removedBirds } from "./bird-count";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { addDays, isISODate, today as lagosToday } from "@/lib/dates";
import { connectDb, withTransaction } from "@/lib/db";
import {
  assertChicksRemovable,
  CHICK_PAYMENTS,
  type ChickPayment,
  chickExpenseOf,
  chicksNeedApproval,
  dropChicks,
  recordChicks,
  resolveHatchery,
  syncChicks,
} from "@/lib/expenses/chicks";
import { type LogTotals, logTotals, NO_TOTALS } from "@/lib/logs/service";
import { getSettings } from "@/lib/settings/service";
import { BatchModel } from "@/models/batch";
import { DailyLogModel } from "@/models/daily-log";
import { HealthEventModel } from "@/models/health-event";
import { nextSequence } from "@/models/counter";
import { HouseModel } from "@/models/house";
import { SalesOrderModel } from "@/models/sales-order";
import { WITH_DELETED } from "@/models/plugins/base";

export type PlacementWarning = { code: string; message: string };

export type BatchView = BatchInput & {
  id: string;
  version: number;
  code: string;
  status: "active" | "selling" | "closed";
  phase: Phase;
  closedOn: string | null;
  houseName: string;
  placed: number;
  paid: number;
  chickCostKobo: number;
  liveBirds: number;
  ageDays: number;
  /** What the daily logs add up to. */
  totals: LogTotals;
  /** A booking: chicks paid for ahead, and whether they've been picked up yet. */
  bookedChicks: number | null;
  pickedUp: boolean;
  /** Chicks paid for that the hatchery didn't hand over. */
  shortfall: number;
  /** The expense recording its chicks (from `getBatch` only; undefined in lists). */
  chickExpense?: { id: string; number: string; paymentStatus: string; approval: string } | null;
};

type Doc = BatchInput & {
  _id: Types.ObjectId | string;
  __v?: number;
  houseId: Types.ObjectId | string;
  code: string;
  status: "active" | "selling" | "closed";
  closedOn?: string | null;
  bookedChicks?: number | null;
  pickedUp?: boolean;
};

function view(b: Doc, houseName: string, today: string, totals: LogTotals = NO_TOTALS): BatchView {
  return {
    id: String(b._id),
    version: b.__v ?? 0,
    code: b.code,
    status: b.status,
    phase: phaseOf(b, today),
    closedOn: b.closedOn ?? null,
    houseId: String(b.houseId),
    houseName,
    placedOn: b.placedOn,
    breed: b.breed,
    delivered: b.delivered,
    deadOnArrival: b.deadOnArrival,
    freeExtras: b.freeExtras,
    pricePerChickKobo: b.pricePerChickKobo,
    supplierName: b.supplierName ?? "",
    supplierId: b.supplierId ? String(b.supplierId) : null,
    bookedChicks: b.bookedChicks ?? null,
    pickedUp: b.pickedUp !== false,
    shortfall: shortfall(b),
    ageAtPlacementDays: b.ageAtPlacementDays,
    targetSellAgeDays: b.targetSellAgeDays,
    targetWeightGrams: b.targetWeightGrams,
    notes: b.notes ?? "",
    placed: placedCount(b),
    paid: paidCount(b),
    chickCostKobo: chickCostKobo(b),
    liveBirds: liveBirds({ placed: placedCount(b), ...totals }),
    ageDays: ageOn(b, today),
    totals,
  };
}

/** House names by id, including houses deleted since (a batch keeps its house's name). */
async function houseNames(farmId: string) {
  const houses = await HouseModel.find({ farmId }, { name: 1 }).setOptions(WITH_DELETED).lean();
  return new Map(houses.map((h) => [String(h._id), h.name]));
}

/** Every batch on the farm, newest placement first. */
export async function listBatches(farmId: string, today = lagosToday()): Promise<BatchView[]> {
  await connectDb();
  const [batches, names] = await Promise.all([
    BatchModel.find({ farmId }).sort({ placedOn: -1, seq: -1 }).lean(),
    houseNames(farmId),
  ]);
  const totals = await logTotals(
    farmId,
    batches.map((b) => String(b._id)),
  );
  return batches.map((b) =>
    view(b as unknown as Doc, names.get(String(b.houseId)) ?? "Unknown house", today, totals.get(String(b._id))),
  );
}

export async function getBatch(farmId: string, id: string, today = lagosToday()): Promise<BatchView | null> {
  await connectDb();
  const batch = await BatchModel.findOne({ _id: id, farmId })
    .lean()
    .catch(() => null);
  if (!batch) return null;
  const [house, totals, chicks] = await Promise.all([
    HouseModel.findById(batch.houseId, { name: 1 }).setOptions(WITH_DELETED).lean(),
    logTotals(farmId, [id]),
    chickExpenseOf(batch._id).lean(),
  ]);
  return {
    ...view(batch as unknown as Doc, house?.name ?? "Unknown house", today, totals.get(id)),
    chickExpense: chicks
      ? {
          id: String(chicks._id),
          number: chicks.number,
          paymentStatus: chicks.paymentStatus,
          approval: chicks.approval,
        }
      : null,
  };
}

/** The batches the shell's switcher offers: everything not closed. */
export async function batchSummaries(farmId: string, today = lagosToday()) {
  return (await listBatches(farmId, today))
    .filter((b) => b.phase !== "closed")
    .map((b) => ({
      id: b.id,
      code: b.code,
      house: b.houseName,
      status: b.phase as "planned" | "active" | "selling",
      day: b.ageDays,
      liveBirds: b.liveBirds,
    }));
}

function clean(input: Record<string, unknown>, today: string): BatchInput {
  const values = {
    houseId: input.houseId,
    placedOn: input.placedOn,
    breed: typeof input.breed === "string" ? input.breed.trim().replace(/\s+/g, " ") : input.breed,
    delivered: input.delivered,
    deadOnArrival: input.deadOnArrival ?? 0,
    freeExtras: input.freeExtras ?? 0,
    pricePerChickKobo: input.pricePerChickKobo,
    supplierName: typeof input.supplierName === "string" ? input.supplierName.trim() : (input.supplierName ?? ""),
    supplierId: input.supplierId === "" || input.supplierId === undefined ? null : input.supplierId,
    ageAtPlacementDays: input.ageAtPlacementDays ?? 0,
    targetSellAgeDays: input.targetSellAgeDays,
    targetWeightGrams: input.targetWeightGrams,
    notes: typeof input.notes === "string" ? input.notes.trim() : (input.notes ?? ""),
  };
  const errors = validateBatch(values, today);
  const [field] = Object.keys(errors) as (keyof BatchInput)[];
  if (field) throw new HttpError(400, "invalid_batch", errors[field]!, field);
  return values as BatchInput;
}

const n = (x: number) => x.toLocaleString("en-NG");

/**
 * What the person should know before placing these chicks: over capacity, a house under
 * maintenance, retired or still resting, another batch already in it, or an unusually old date.
 * They can go ahead after confirming; none of these is wrong on a real farm, just worth a look.
 */
export async function placementWarnings(
  farmId: string,
  values: Pick<BatchInput, "houseId" | "placedOn" | "delivered" | "deadOnArrival">,
  today: string,
  excludeId?: string,
): Promise<PlacementWarning[]> {
  const house = await HouseModel.findOne({ _id: values.houseId, farmId })
    .lean()
    .catch(() => null);
  if (!house)
    throw new HttpError(400, "invalid_batch", "That house doesn't exist any more. Choose another.", "houseId");

  const [others, lastClosed, settings] = await Promise.all([
    BatchModel.find({
      farmId,
      houseId: house._id,
      status: { $ne: "closed" },
      ...(excludeId && { _id: { $ne: excludeId } }),
    }).lean(),
    BatchModel.findOne({ farmId, houseId: house._id, status: "closed", closedOn: { $ne: null } })
      .sort({ closedOn: -1 })
      .lean(),
    getSettings(farmId),
  ]);

  const warnings: PlacementWarning[] = [];
  if (house.status === "retired") warnings.push({ code: "house_retired", message: `${house.name} is retired.` });
  if (house.status === "maintenance")
    warnings.push({ code: "house_maintenance", message: `${house.name} is under maintenance.` });

  if (others.length)
    warnings.push({
      code: "house_shared",
      message: `${others.map((b) => b.code).join(", ")} ${others.length === 1 ? "is" : "are"} still in ${house.name}. Mixing ages in one house works against all-in, all-out.`,
    });

  // Live birds: deaths, culls and sales in the other batches free up room.
  const othersTotals = await logTotals(
    farmId,
    others.map((b) => String(b._id)),
  );
  const occupied = others.reduce(
    (sum, b) => sum + liveBirds({ placed: placedCount(b), ...(othersTotals.get(String(b._id)) ?? NO_TOTALS) }),
    0,
  );
  const total = occupied + placedCount(values);
  if (total > house.capacity)
    warnings.push({
      code: "over_capacity",
      message: `That puts ${n(total)} birds in ${house.name}, which holds ${n(house.capacity)} (${n(total - house.capacity)} over). Crowded birds grow slower and die more in the heat.`,
    });

  if (lastClosed?.closedOn) {
    const rested = daysBetween(lastClosed.closedOn, values.placedOn);
    if (rested >= 0 && rested < settings.houseRestDays)
      warnings.push({
        code: "house_resting",
        message: `${house.name} was emptied on ${lastClosed.closedOn} and rests ${settings.houseRestDays} days for cleaning and disinfection (until ${addDays(lastClosed.closedOn, settings.houseRestDays)}).`,
      });
  }

  // Longer ago than a whole broiler cycle (8 weeks) is more likely a typo than a late record.
  const ago = daysBetween(values.placedOn, today);
  if (ago > 56)
    warnings.push({ code: "old_date", message: `That's ${ago} days ago. Fine if you're recording an earlier batch.` });
  return warnings;
}

const needsConfirmation = (warnings: PlacementWarning[]) =>
  new HttpError(409, "needs_confirmation", "Check these before going ahead.", undefined, { warnings });

/**
 * Creates a batch with the next code for its placement year (B-2026-07). The code and the batch
 * are written in one transaction, so codes never repeat or skip. `requestId` makes a retried
 * submission (a double tap, a flaky network) return the batch it already created.
 */
export async function createBatch(
  actor: CurrentUser,
  input: Record<string, unknown>,
  { confirm = false, requestId }: { confirm?: boolean; requestId?: string } = {},
  today = lagosToday(),
): Promise<{ batch: BatchView; created: boolean }> {
  const values = clean(input, today);
  await connectDb();
  const id = typeof requestId === "string" && /^[\w-]{8,64}$/.test(requestId) ? requestId : null;
  const existing = async () => {
    const found = id ? await BatchModel.findOne({ farmId: actor.farmId, clientRequestId: id }).lean() : null;
    return found ? { batch: (await getBatch(actor.farmId, String(found._id), today))!, created: false } : null;
  };
  const retried = await existing();
  if (retried) return retried;

  const warnings = await placementWarnings(actor.farmId, values, today);
  if (warnings.length && !confirm) throw needsConfirmation(warnings);
  Object.assign(values, await resolveHatchery(actor.farmId, values));
  // The chicks become an expense with the batch: paid already, or owed to the hatchery.
  const paidBy = CHICK_PAYMENTS.includes(input.chicksPaidBy as ChickPayment)
    ? (input.chicksPaidBy as ChickPayment)
    : "later";
  // A booking: the chicks are paid for now and picked up later, so what's paid stays fixed.
  const booking = input.booking === true;
  const booked = booking ? { pickedUp: false, bookedChicks: paidCount(values) } : {};
  const pending = await chicksNeedApproval(actor, values);

  const year = Number(values.placedOn.slice(0, 4));
  try {
    const batchId = await withTransaction(async (session) => {
      const seq = await nextSequence(actor.farmId, `batch:${year}`, session);
      const [doc] = await BatchModel.create(
        [
          {
            ...values,
            ...booked,
            farmId: actor.farmId,
            createdBy: actor.id,
            code: `B-${year}-${String(seq).padStart(2, "0")}`,
            year,
            seq,
            clientRequestId: id,
          },
        ],
        { session },
      );
      await recordChicks(session, actor, doc, { paidBy, pending, today });
      return String(doc._id);
    });
    return { batch: (await getBatch(actor.farmId, batchId, today))!, created: true };
  } catch (error) {
    // The same request, sent twice at once: the other one won.
    if ((error as { code?: number }).code === 11000) {
      const won = await existing();
      if (won) return won;
    }
    throw error;
  }
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const batch = await BatchModel.findOne({ _id: id, farmId: actor.farmId }).catch(() => null);
  if (!batch) throw new HttpError(404, "not_found", "That batch doesn't exist any more.");
  return batch;
}

const stale = () =>
  new HttpError(409, "stale", "Someone changed this batch while you were editing. Close and open it again.");

/**
 * Saves changes to a batch. Refused for a closed batch, or a form older than the last save. A new
 * house, date or count is checked like a new placement.
 */
export async function updateBatch(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  { version, confirm = false }: { version: unknown; confirm?: boolean },
  today = lagosToday(),
) {
  const values = clean(input, today);
  const batch = await load(actor, id);
  if (batch.status === "closed") throw new HttpError(409, "closed", "A closed batch can't be changed.");
  if (typeof version !== "number" || version !== batch.__v) throw stale();
  const removed = removedBirds((await logTotals(actor.farmId, [id])).get(id) ?? NO_TOTALS);
  if (placedCount(values) < removed)
    throw new HttpError(
      400,
      "invalid_batch",
      `The daily logs already account for ${n(removed)} birds, more than the ${n(placedCount(values))} this would place.`,
      "delivered",
    );

  const moved =
    String(batch.houseId) !== values.houseId ||
    batch.placedOn !== values.placedOn ||
    placedCount(values) > placedCount(batch);
  if (moved) {
    const warnings = await placementWarnings(actor.farmId, values, today, id);
    if (warnings.length && !confirm) throw needsConfirmation(warnings);
  }
  Object.assign(values, await resolveHatchery(actor.farmId, values));
  batch.set(values);
  // Until picked up, a booking's paid-for count follows its edits.
  if (batch.pickedUp === false) batch.bookedChicks = values.delivered - values.freeExtras;
  try {
    // The chicks expense follows the batch: count, price, hatchery and day.
    await withTransaction(async (session) => {
      batch.$session(session);
      await batch.save();
      await syncChicks(session, batch, today);
    });
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return (await getBatch(actor.farmId, id, today))!;
}

/**
 * Records the chicks of a batch placed before Fowlex did it by itself, as an expense charged to it.
 * Refused if it already has one.
 */
export async function recordBatchChicks(actor: CurrentUser, id: string, paidBy: unknown, today = lagosToday()) {
  const batch = await load(actor, id);
  if (await chickExpenseOf(batch._id))
    throw new HttpError(409, "recorded", `${batch.code}'s chicks are already recorded.`);
  const how = CHICK_PAYMENTS.includes(paidBy as ChickPayment) ? (paidBy as ChickPayment) : "later";
  const pending = await chicksNeedApproval(actor, batch);
  await withTransaction((session) => recordChicks(session, actor, batch, { paidBy: how, pending, today }));
  return (await getBatch(actor.farmId, id, today))!;
}

/** Starts selling, or goes back to growing. Closing is `closeBatch`, once every bird is accounted for. */
export async function setBatchStatus(actor: CurrentUser, id: string, status: unknown, today = lagosToday()) {
  if (status !== "active" && status !== "selling")
    throw new HttpError(400, "invalid_status", "Choose growing or selling.");
  const batch = await load(actor, id);
  if (batch.status === "closed") throw new HttpError(409, "closed", "A closed batch can't be changed.");
  if (status === "selling" && batch.placedOn > today)
    throw new HttpError(409, "not_placed", "These chicks haven't been placed yet.");
  batch.status = status;
  await batch.save();
  return (await getBatch(actor.farmId, id, today))!;
}

/** Deletes a batch (kept, hidden and audited), only while nothing has been logged against it. */
export async function deleteBatch(actor: CurrentUser, id: string) {
  const batch = await load(actor, id);
  const days = (await logTotals(actor.farmId, [id])).get(id)?.days ?? 0;
  if (days)
    throw new HttpError(
      409,
      "has_logs",
      `${batch.code} has ${days} day${days === 1 ? "" : "s"} of logs. Delete those first, or close the batch instead.`,
    );
  const orders = await SalesOrderModel.countDocuments({ "lines.batchId": batch._id, status: { $ne: "cancelled" } });
  if (orders)
    throw new HttpError(
      409,
      "has_orders",
      `${batch.code} is on ${orders} sales order${orders === 1 ? "" : "s"}, so it stays.`,
    );
  await assertChicksRemovable(batch._id, batch.code);
  await withTransaction(async (session) => {
    batch.$session(session);
    await batch.softDelete();
    await dropChicks(session, batch._id);
  });
}

export type CloseTally = { placed: number; deaths: number; culls: number; sold: number; unaccounted: number };

/**
 * Closes a batch once every bird placed is accounted for as dead, culled or sold. Refused with the
 * number still unaccounted for (in `details.tally`) otherwise. The close date can't be before the
 * batch's last record or in the future; from then its logs and health record are locked, and its
 * house's rest starts.
 */
export async function closeBatch(
  actor: CurrentUser,
  id: string,
  input: { closedOn?: unknown; version?: unknown },
  today = lagosToday(),
) {
  const batch = await load(actor, id);
  if (batch.status === "closed") throw new HttpError(409, "closed", `${batch.code} is already closed.`);
  if (typeof input.version !== "number" || input.version !== batch.__v) throw stale();
  if (batch.placedOn > today) throw new HttpError(409, "not_placed", "These chicks haven't been placed yet.");

  const totals = (await logTotals(actor.farmId, [id])).get(id) ?? NO_TOTALS;
  const tally: CloseTally = {
    placed: placedCount(batch),
    deaths: totals.deaths,
    culls: totals.culls,
    sold: totals.sold,
    unaccounted: liveBirds({ placed: placedCount(batch), ...totals }),
  };
  if (tally.unaccounted)
    throw new HttpError(
      409,
      "birds_unaccounted",
      `${n(tally.unaccounted)} bird${tally.unaccounted === 1 ? " isn't" : "s aren't"} accounted for. Log ${
        tally.unaccounted === 1 ? "it" : "them"
      } as dead, culled or sold before closing.`,
      undefined,
      { tally },
    );

  const closedOn = input.closedOn === undefined || input.closedOn === "" ? today : input.closedOn;
  const [lastLog, lastHealth] = await Promise.all([
    DailyLogModel.findOne({ farmId: actor.farmId, batchId: id }, { date: 1 }).sort({ date: -1 }).lean(),
    HealthEventModel.findOne({ farmId: actor.farmId, batchId: id }, { date: 1 }).sort({ date: -1 }).lean(),
  ]);
  const last = [batch.placedOn, lastLog?.date, lastHealth?.date].filter(Boolean).sort().at(-1)!;
  if (typeof closedOn !== "string" || !isISODate(closedOn))
    throw new HttpError(400, "invalid_close", "Choose the day the house was emptied.", "closedOn");
  if (closedOn > today) throw new HttpError(400, "invalid_close", "That's in the future.", "closedOn");
  if (closedOn < last)
    throw new HttpError(
      400,
      "invalid_close",
      `The batch has records up to ${last}; close it on or after that.`,
      "closedOn",
    );

  batch.set({ status: "closed", closedOn });
  try {
    await batch.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return (await getBatch(actor.farmId, id, today))!;
}

/** Undoes a close made by mistake: the batch goes back to selling, and its records unlock. */
export async function reopenBatch(actor: CurrentUser, id: string, today = lagosToday()) {
  const batch = await load(actor, id);
  if (batch.status !== "closed") throw new HttpError(409, "not_closed", `${batch.code} isn't closed.`);
  batch.set({ status: "selling", closedOn: null });
  await batch.save();
  return (await getBatch(actor.farmId, id, today))!;
}

/**
 * Booked chicks picked up and placed: what turned up (delivered, dead on arrival, free extras), the
 * house they went into and the day. The batch starts that day; what was paid stays as booked, and
 * any chicks the hatchery didn't hand over are counted as its shortfall.
 */
export async function pickUpBatch(
  actor: CurrentUser,
  id: string,
  input: Record<string, unknown>,
  { confirm = false, version }: { confirm?: boolean; version: unknown },
  today = lagosToday(),
) {
  const batch = await load(actor, id);
  if (batch.status === "closed") throw new HttpError(409, "closed", "A closed batch can't be changed.");
  if (batch.pickedUp !== false && batch.placedOn <= today)
    throw new HttpError(409, "placed", `${batch.code}'s chicks are already in the house.`);
  if (typeof version !== "number" || version !== batch.__v) throw stale();
  const current = view(batch.toObject() as unknown as Doc, "", today);
  const on = input.pickedUpOn === undefined || input.pickedUpOn === "" ? today : input.pickedUpOn;
  if (typeof on !== "string" || !isISODate(on) || on > today)
    throw new HttpError(400, "invalid_batch", "Choose the day they were picked up: today or earlier.", "pickedUpOn");
  const values = clean(
    {
      ...current,
      placedOn: on,
      houseId: input.houseId ?? current.houseId,
      delivered: input.delivered ?? current.delivered,
      deadOnArrival: input.deadOnArrival ?? 0,
      freeExtras: input.freeExtras ?? 0,
    },
    today,
  );
  // Checked when booked: ask again only if they went into another house, or more came.
  if (values.houseId !== current.houseId || placedCount(values) > placedCount(current)) {
    const warnings = await placementWarnings(actor.farmId, values, today, id);
    if (warnings.length && !confirm) throw needsConfirmation(warnings);
  }
  batch.set({ ...values, pickedUp: true, bookedChicks: batch.bookedChicks ?? paidCount(current) });
  try {
    await withTransaction(async (session) => {
      batch.$session(session);
      await batch.save();
      await syncChicks(session, batch, today);
    });
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw stale();
    throw error;
  }
  return (await getBatch(actor.farmId, id, today))!;
}
