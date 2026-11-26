import "server-only";

import { Types } from "mongoose";

import { type HouseInput, nameKey, tidyName, validateHouse } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { connectDb } from "@/lib/db";
import { BatchModel } from "@/models/batch";
import { HouseModel } from "@/models/house";

export type HouseView = HouseInput & {
  id: string;
  version: number;
  /** Birds in it now: placed birds of the batches in it that aren't closed. */
  occupied: number;
  /** Batches in it that aren't closed. */
  batchCount: number;
};

type HouseDoc = { _id: unknown; __v?: number } & HouseInput;
const view = (h: HouseDoc, occupancy?: { occupied: number; batchCount: number }): HouseView => ({
  id: String(h._id),
  version: h.__v ?? 0,
  occupied: occupancy?.occupied ?? 0,
  batchCount: occupancy?.batchCount ?? 0,
  name: h.name,
  capacity: h.capacity,
  floorAreaSqm: h.floorAreaSqm ?? null,
  system: h.system,
  ventilation: h.ventilation,
  status: h.status,
  notes: h.notes ?? "",
});

/** The farm's houses, in name order (House 2 before House 10). */
export async function listHouses(farmId: string): Promise<HouseView[]> {
  await connectDb();
  const [houses, occupancy] = await Promise.all([
    HouseModel.find({ farmId }).collation({ locale: "en", numericOrdering: true }).sort({ name: 1 }).lean(),
    BatchModel.aggregate<{ _id: unknown; occupied: number; batchCount: number }>([
      { $match: { farmId: new Types.ObjectId(farmId), status: { $ne: "closed" } } },
      {
        $group: {
          _id: "$houseId",
          occupied: { $sum: { $subtract: ["$delivered", "$deadOnArrival"] } },
          batchCount: { $sum: 1 },
        },
      },
    ]),
  ]);
  const byHouse = new Map(occupancy.map((o) => [String(o._id), o]));
  return houses.map((h) => view(h as unknown as HouseDoc, byHouse.get(String(h._id))));
}

function clean(input: Record<string, unknown>): HouseInput {
  const values = {
    name: typeof input.name === "string" ? tidyName(input.name) : input.name,
    capacity: input.capacity,
    floorAreaSqm: input.floorAreaSqm === "" || input.floorAreaSqm === undefined ? null : input.floorAreaSqm,
    system: input.system ?? "deep-litter",
    ventilation: input.ventilation ?? "open-sided",
    status: input.status ?? "active",
    notes: typeof input.notes === "string" ? input.notes.trim() : (input.notes ?? ""),
  };
  const errors = validateHouse(values);
  const [field] = Object.keys(errors) as (keyof HouseInput)[];
  if (field) throw new HttpError(400, "invalid_house", errors[field]!, field);
  return values as HouseInput;
}

const duplicate = (name: string) =>
  new HttpError(409, "duplicate_name", `There's already a house called ${name}. Use another name.`, "name");

export async function createHouse(actor: CurrentUser, input: Record<string, unknown>): Promise<HouseView> {
  const values = clean(input);
  await connectDb();
  try {
    const house = await HouseModel.create({
      ...values,
      nameKey: nameKey(values.name),
      farmId: actor.farmId,
      createdBy: actor.id,
    });
    return view(house.toObject() as unknown as HouseDoc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw duplicate(values.name);
    throw error;
  }
}

/**
 * Saves changes to a house. `version` is the one the form loaded: if someone saved since, this is
 * refused (409) instead of silently overwriting their change.
 */
export async function updateHouse(actor: CurrentUser, id: string, input: Record<string, unknown>, version: unknown) {
  const values = clean(input);
  await connectDb();
  const house = await HouseModel.findOne({ _id: id, farmId: actor.farmId });
  if (!house) throw new HttpError(404, "not_found", "That house doesn't exist any more.");
  if (typeof version !== "number" || version !== house.__v)
    throw new HttpError(409, "stale", "Someone changed this house while you were editing. Close and open it again.");
  house.set({ ...values, nameKey: nameKey(values.name) });
  try {
    await house.save();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw duplicate(values.name);
    if ((error as { name?: string }).name === "VersionError")
      throw new HttpError(409, "stale", "Someone changed this house while you were editing. Close and open it again.");
    throw error;
  }
  return view(house.toObject() as unknown as HouseDoc);
}

/** Removes a house that has never held a batch. One with history is retired instead, keeping it. */
export async function deleteHouse(actor: CurrentUser, id: string) {
  await connectDb();
  const house = await HouseModel.findOne({ _id: id, farmId: actor.farmId });
  if (!house) throw new HttpError(404, "not_found", "That house doesn't exist any more.");
  if (await BatchModel.exists({ farmId: actor.farmId, houseId: house._id }))
    throw new HttpError(
      409,
      "has_batches",
      `${house.name} has held batches, so it stays in their history. Set its status to Retired instead.`,
    );
  await house.softDelete();
}
