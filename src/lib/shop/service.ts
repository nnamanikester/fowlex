import "server-only";

import { Types } from "mongoose";

import { ORDER_DAYS, type OnlineOrderInput, readyOn, slugFrom, validateOnlineOrder } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { listBatches } from "@/lib/batches/service";
import { contractFor } from "@/lib/contracts/service";
import { addDays, today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatNaira } from "@/lib/money";
import { readSettings } from "@/lib/settings/service";
import { normalisePhone } from "@/lib/suppliers/rules";
import { nextSequence } from "@/models/counter";
import { CustomerModel } from "@/models/customer";
import { SalesOrderModel } from "@/models/sales-order";
import { SettingsModel } from "@/models/settings";
import { UserModel } from "@/models/user";

export type ShopSettings = { enabled: boolean; slug: string | null; delivers: boolean; pricePerKgKobo: number | null };

/** The order page's settings, for the Sales page. */
export async function shopSettings(farmId: string): Promise<ShopSettings> {
  const s = await readSettings(farmId);
  const doc = await SettingsModel.findOne({ farmId }, { shopEnabled: 1, shopSlug: 1, shopDelivers: 1 }).lean();
  return {
    enabled: !!doc?.shopEnabled,
    slug: doc?.shopSlug ?? null,
    delivers: doc?.shopDelivers ?? true,
    pricePerKgKobo: s.defaultPricePerKgKobo,
  };
}

/** A free address for the page: the farm's name, with a number when another farm has it. */
async function freeSlug(farmId: string, name: string) {
  const base = slugFrom(name);
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await SettingsModel.exists({ shopSlug: slug, farmId: { $ne: farmId } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Turns the order page on or off, says whether the farm delivers, and sets the price per kg it
 * shows (the farm's usual price, also used for orders without a contract). Turning it on needs a
 * price, so customers always see one; the page's address is made from the farm's name once.
 */
export async function updateShop(actor: CurrentUser, input: Record<string, unknown>) {
  await connectDb();
  await readSettings(actor.farmId); // Makes the settings if they're not there yet.
  const doc = (await SettingsModel.findOne({ farmId: actor.farmId }))!;
  const price = input.pricePerKgKobo === undefined ? doc.defaultPricePerKgKobo : input.pricePerKgKobo;
  if (price !== null && (typeof price !== "number" || !Number.isInteger(price) || price < 1 || price > 10_000_000_00))
    throw new HttpError(400, "invalid_shop", "Enter your price per kg.", "pricePerKgKobo");
  const enabled = input.enabled === undefined ? doc.shopEnabled : input.enabled === true;
  if (enabled && !price)
    throw new HttpError(
      400,
      "invalid_shop",
      "Set your price per kg first: customers see it on the page.",
      "pricePerKgKobo",
    );
  doc.set({
    shopEnabled: enabled,
    shopDelivers: input.delivers === undefined ? doc.shopDelivers : input.delivers === true,
    defaultPricePerKgKobo: price,
    ...(enabled && !doc.shopSlug && { shopSlug: await freeSlug(actor.farmId, doc.businessName) }),
  });
  await doc.save();
  return shopSettings(actor.farmId);
}

type Sellable = { id: string; code: string; free: number; readyOn: string; weightGrams: number };

/**
 * The birds on offer: each batch growing or selling, its live birds less those already booked on
 * orders still to deliver, from the day it's ready (a week before its selling age), oldest first.
 */
async function sellable(farmId: string, today: string): Promise<Sellable[]> {
  const batches = (await listBatches(farmId, today)).filter(
    (b) => (b.phase === "active" || b.phase === "selling") && b.liveBirds > 0,
  );
  const booked = await SalesOrderModel.aggregate<{ _id: Types.ObjectId; birds: number }>([
    { $match: { farmId: new Types.ObjectId(farmId), status: "pending" } },
    { $unwind: "$lines" },
    { $group: { _id: "$lines.batchId", birds: { $sum: "$lines.birds" } } },
  ]);
  const held = new Map(booked.map((r) => [String(r._id), r.birds]));
  return batches
    .map((b) => ({
      id: b.id,
      code: b.code,
      free: Math.max(0, b.liveBirds - (held.get(b.id) ?? 0)),
      readyOn: readyOn(b.placedOn, b.targetSellAgeDays, today),
      // Their last weighing, or the weight they're grown to.
      weightGrams: b.totals.lastWeight?.grams ?? b.targetWeightGrams,
    }))
    .filter((b) => b.free > 0)
    .sort((a, b) => a.readyOn.localeCompare(b.readyOn) || a.code.localeCompare(b.code));
}

export type Offer = {
  farm: { name: string; phone: string; email: string; address: string };
  slug: string;
  pricePerKgKobo: number;
  delivers: boolean;
  /** Birds that can be had on each day from today, for the days that have any. */
  days: { date: string; birds: number }[];
  readyNow: number;
  /** About how heavy a bird is, across what's on offer. */
  weightGrams: number;
};

async function shopFarm(slug: string) {
  await connectDb();
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const doc = await SettingsModel.findOne({ shopSlug: slug, shopEnabled: true }).lean();
  return doc && doc.defaultPricePerKgKobo ? doc : null;
}

/** What the public order page shows, or null when there's no such page or it's off. */
export async function shopOffer(slug: string, today = lagosToday()): Promise<Offer | null> {
  const doc = await shopFarm(slug);
  if (!doc) return null;
  const farmId = String(doc.farmId);
  const batches = await sellable(farmId, today);
  const days: Offer["days"] = [];
  for (let n = 0; n < ORDER_DAYS; n++) {
    const date = addDays(today, n);
    const birds = batches.filter((b) => b.readyOn <= date).reduce((sum, b) => sum + b.free, 0);
    if (birds > 0) days.push({ date, birds });
  }
  const total = batches.reduce((sum, b) => sum + b.free, 0);
  const weightGrams = total ? Math.round(batches.reduce((sum, b) => sum + b.weightGrams * b.free, 0) / total) : 0;
  return {
    farm: { name: doc.businessName, phone: doc.phone, email: doc.email, address: doc.address },
    slug: doc.shopSlug!,
    pricePerKgKobo: doc.defaultPricePerKgKobo!,
    delivers: doc.shopDelivers,
    days,
    readyNow: days[0]?.date === today ? days[0].birds : 0,
    weightGrams,
  };
}

// A few orders a minute from one address is a person; more is a script.
const recent = new Map<string, number[]>();
function throttle(key: string, now = Date.now()) {
  const times = (recent.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  if (times.length >= 5)
    throw new HttpError(429, "too_many", "That's a lot of orders at once. Wait a few minutes, or call us.");
  recent.set(key, [...times, now]);
}

export type Placed = {
  number: string;
  birds: number;
  date: string;
  delivery: boolean;
  estimateKobo: number;
  name: string;
  phone: string;
  email: string;
  farm: Offer["farm"];
};

/**
 * A customer orders from the public page. The farm does the rest: the customer is found by phone
 * or email (or added), the birds are taken from the batches ready by that day (oldest first), the
 * order is priced by their contract or the page's price per kg and booked to deliver, and the farm
 * and the customer are emailed. The same form sent twice books once.
 */
export async function placeOnlineOrder(
  slug: string,
  input: Record<string, unknown>,
  { ip = "", today = lagosToday(), origin = "" }: { ip?: string; today?: string; origin?: string } = {},
): Promise<Placed> {
  const doc = await shopFarm(slug);
  if (!doc) throw new HttpError(404, "not_found", "This order page isn't taking orders right now.");
  // A field people never see: only scripts fill it in.
  if (typeof input.website === "string" && input.website)
    throw new HttpError(400, "invalid_order", "Something's off with this form. Reload the page.");
  const farmId = String(doc.farmId);
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : v);
  const values = {
    birds: input.birds,
    date: input.date,
    delivery: input.delivery,
    name: text(input.name),
    phone: text(input.phone),
    email: typeof input.email === "string" ? input.email.trim().toLowerCase() : (input.email ?? ""),
    business: text(input.business ?? ""),
    address: text(input.address ?? ""),
    notes: text(input.notes ?? ""),
  };
  const errors = validateOnlineOrder(values, { delivers: doc.shopDelivers });
  const [field] = Object.keys(errors) as (keyof OnlineOrderInput)[];
  if (field) throw new HttpError(400, "invalid_order", errors[field]!, field);
  const v = values as OnlineOrderInput;
  const phone = normalisePhone(v.phone)!;
  const requestId =
    typeof input.requestId === "string" && /^[\w-]{8,64}$/.test(input.requestId) ? input.requestId : null;
  const farm = { name: doc.businessName, phone: doc.phone, email: doc.email, address: doc.address };

  if (requestId) {
    const again = await SalesOrderModel.findOne({ farmId, requestId }).lean();
    if (again) return placedView(again, farm, doc.defaultPricePerKgKobo!);
  }
  throttle(`${slug}|${ip}`);
  if (v.date < today || v.date > addDays(today, ORDER_DAYS - 1))
    throw new HttpError(400, "invalid_order", "Choose one of the days shown.", "date");

  // Birds from the batches ready by then, oldest first.
  const batches = (await sellable(farmId, today)).filter((b) => b.readyOn <= v.date);
  const available = batches.reduce((n, b) => n + b.free, 0);
  if (v.birds > available)
    throw new HttpError(
      409,
      "not_enough",
      available
        ? `We have ${available.toLocaleString("en-NG")} birds for that day. Choose fewer, or a later day.`
        : "Those birds have just been ordered. Choose another day.",
      "birds",
    );
  let left = v.birds;
  const take: { batchId: string; birds: number }[] = [];
  for (const b of batches) {
    if (!left) break;
    const n = Math.min(left, b.free);
    take.push({ batchId: b.id, birds: n });
    left -= n;
  }

  const customer = await findOrAddCustomer(farmId, { ...v, phone });
  const contract = await contractFor(farmId, String(customer._id), v.date);
  const pricing = contract?.pricing ?? "perKg";
  const priceKobo = contract?.priceKobo ?? doc.defaultPricePerKgKobo!;
  const where = v.delivery ? `Deliver to: ${v.address}` : "Collecting from the farm";
  const year = v.date.slice(0, 4);
  const seq = await nextSequence(farmId, `order:${year}`);
  let order;
  try {
    order = await SalesOrderModel.create({
      farmId,
      createdBy: null,
      number: `SO-${year}-${String(seq).padStart(4, "0")}`,
      customerId: customer._id,
      contractId: contract?.id ?? null,
      deliveryDate: v.date,
      // Per kg, the birds are weighed on the day: the amount is worked out then.
      lines: take.map((t) => ({ ...t, weightGrams: 0, priceKobo, pricing })),
      deliveryKobo: 0,
      totalKobo: pricing === "perBird" ? v.birds * priceKobo : 0,
      notes: [where, v.notes].filter(Boolean).join(". ").slice(0, 500),
      source: "online",
      contact: { name: v.name, phone, email: v.email, business: v.business, delivery: v.delivery, address: v.address },
      requestId,
    });
  } catch (error) {
    // The same form, sent twice at once: the first booked it.
    if ((error as { code?: number }).code === 11000 && requestId) {
      const again = await SalesOrderModel.findOne({ farmId, requestId }).lean();
      if (again) return placedView(again, farm, doc.defaultPricePerKgKobo!);
    }
    throw error;
  }
  const placed = placedView(order.toObject(), farm, doc.defaultPricePerKgKobo!, {
    weightGrams: batchesWeight(batches, take),
  });
  await tell(farmId, placed, String(order._id), customer.name, origin).catch((error) =>
    console.error("[shop] emails", error),
  );
  return placed;
}

const batchesWeight = (batches: Sellable[], take: { batchId: string; birds: number }[]) => {
  const birds = take.reduce((n, t) => n + t.birds, 0);
  return birds
    ? Math.round(
        take.reduce((n, t) => n + (batches.find((b) => b.id === t.batchId)?.weightGrams ?? 0) * t.birds, 0) / birds,
      )
    : 0;
};

function placedView(
  o: {
    number: string;
    deliveryDate: string;
    lines: { birds: number; priceKobo: number; pricing: string }[];
    contact?: { name?: string; phone?: string; email?: string; delivery?: boolean } | null;
  },
  farm: Offer["farm"],
  pricePerKgKobo: number,
  { weightGrams = 2200 }: { weightGrams?: number } = {},
): Placed {
  const birds = o.lines.reduce((n, l) => n + l.birds, 0);
  const first = o.lines[0];
  const estimateKobo =
    first?.pricing === "perBird"
      ? birds * first.priceKobo
      : Math.round((birds * weightGrams * (first?.priceKobo ?? pricePerKgKobo)) / 1000);
  return {
    number: o.number,
    birds,
    date: o.deliveryDate,
    delivery: !!o.contact?.delivery,
    estimateKobo,
    name: o.contact?.name ?? "",
    phone: o.contact?.phone ?? "",
    email: o.contact?.email ?? "",
    farm,
  };
}

/** The customer who ordered: the one with this phone or email, or a new one. */
async function findOrAddCustomer(farmId: string, v: OnlineOrderInput & { phone: string }) {
  const found = await CustomerModel.findOne({
    farmId,
    $or: [{ phone: v.phone }, ...(v.email ? [{ email: v.email }] : [])],
  })
    .sort({ status: 1 })
    .lean();
  if (found) {
    // Fill in what the farm didn't have; never overwrite what it typed.
    const missing = {
      ...(!found.email && v.email && { email: v.email }),
      ...(!found.phone && { phone: v.phone }),
      ...(!found.address && v.address && { address: v.address }),
      ...(found.status === "archived" && { status: "active" }),
    };
    if (Object.keys(missing).length) await CustomerModel.updateOne({ _id: found._id }, { $set: missing });
    return found;
  }
  const settings = await readSettings(farmId);
  const name = v.business || v.name;
  // A name another customer already has gets the person's name beside it.
  const taken = await CustomerModel.exists({ farmId, status: "active", name }).collation({ locale: "en", strength: 2 });
  return CustomerModel.create({
    farmId,
    createdBy: null,
    name: taken ? `${name} (${v.name})` : name,
    type: v.business ? "other" : "individual",
    contactName: v.business ? v.name : "",
    phone: v.phone,
    email: v.email,
    address: v.address,
    termsDays: settings.paymentTermsDays,
    notes: "Added from the online order page.",
  });
}

const prettyPhone = (p: string) => (/^\+234\d{10}$/.test(p) ? `0${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : p);

async function tell(farmId: string, p: Placed, orderId: string, customerName: string, origin: string) {
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${p.date}T12:00:00Z`));
  const team = await UserModel.find(
    { farmId, role: { $in: ["owner", "sales"] }, status: "active" },
    { email: 1, name: 1 },
  ).lean();
  for (const person of team)
    await sendEmail({
      to: person.email,
      subject: `New order: ${p.birds.toLocaleString("en-NG")} birds for ${customerName}, ${day}`,
      text: [
        `Hi ${person.name},`,
        "",
        `${p.name} (${customerName}) ordered ${p.birds.toLocaleString("en-NG")} birds on your order page for ${day}, ${p.delivery ? "to be delivered" : "collecting from the farm"}.`,
        `Call them on ${prettyPhone(p.phone)} to confirm.`,
        "",
        `${origin}/sales?open=${orderId}`,
      ].join("\n"),
    });
  if (p.email)
    await sendEmail({
      to: p.email,
      subject: `Your order ${p.number} with ${p.farm.name}`,
      text: [
        `Hello ${p.name},`,
        "",
        `Thank you. We have your order for ${p.birds.toLocaleString("en-NG")} birds on ${day}, ${p.delivery ? "delivered to you" : "to collect from the farm"}.`,
        `It comes to about ${formatNaira(p.estimateKobo)}; the final amount is worked out when the birds are weighed.`,
        `We'll call you on ${prettyPhone(p.phone)} to confirm${p.farm.phone ? `, or call us on ${p.farm.phone}` : ""}.`,
        "",
        p.farm.name,
      ].join("\n"),
    });
}
