import "server-only";

import { Types } from "mongoose";

import {
  CATEGORY_FOR_ITEM,
  describeLines,
  type ExpenseCategory,
  type ExpenseInput,
  expenseTotal,
  type PaymentStatus,
  validateExpense,
} from "./rules";
import { checkAssetFromExpense, createAssetFromExpense } from "@/lib/assets/service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { isISODate, today as lagosToday } from "@/lib/dates";
import { connectDb, withTransaction } from "@/lib/db";
import { type Category, type ItemInput, nameKey, tidyName } from "@/lib/inventory/rules";
import { AssetModel } from "@/models/asset";
import { BatchModel } from "@/models/batch";
import { nextSequence } from "@/models/counter";
import { ExpenseModel } from "@/models/expense";
import { InventoryItemModel } from "@/models/inventory-item";
import { PayoutModel } from "@/models/payout";
import { StockMovementModel } from "@/models/stock-movement";
import { SupplierModel } from "@/models/supplier";
import { createRecipient, resolveAccount } from "@/lib/paystack/banks";
import type { BankAccount } from "@/lib/suppliers/rules";
import { createSupplier } from "@/lib/suppliers/service";

export type ExpenseView = Omit<ExpenseInput, "amountKobo"> & {
  id: string;
  version: number;
  number: string;
  amountKobo: number;
  paymentStatus: PaymentStatus;
  paidOn: string | null;
  /** Fowlex recorded it itself (a Paystack fee): it changes with its transfer, not by hand. */
  automatic: boolean;
  /** Equipment: counted as depreciation over its life. */
  capital: boolean;
  createdAt: string;
};

type Doc = {
  _id: unknown;
  __v?: number;
  number: string;
  date: string;
  category: ExpenseCategory;
  description?: string;
  supplierId?: unknown;
  payeeName?: string;
  payeeBank?: { bankCode: string; bankName?: string; accountNumber: string; accountName: string } | null;
  batchId?: unknown;
  lines?: { itemId: unknown; quantity: number; unitCostKobo: number }[];
  deliveryKobo?: number;
  amountKobo: number;
  method: ExpenseInput["method"];
  paymentStatus: PaymentStatus;
  paidOn?: string | null;
  notes?: string;
  receipt?: { url: string; name?: string } | null;
  source?: { kind?: string | null };
  capital?: boolean;
  createdAt?: Date;
};
const view = (e: Doc): ExpenseView => ({
  id: String(e._id),
  version: e.__v ?? 0,
  number: e.number,
  date: e.date,
  category: e.category,
  description: e.description ?? "",
  supplierId: e.supplierId ? String(e.supplierId) : null,
  payeeName: e.payeeName ?? "",
  payeeBank: e.payeeBank
    ? {
        bankCode: e.payeeBank.bankCode,
        bankName: e.payeeBank.bankName ?? "",
        accountNumber: e.payeeBank.accountNumber,
        accountName: e.payeeBank.accountName,
      }
    : null,
  batchId: e.batchId ? String(e.batchId) : null,
  lines: (e.lines ?? []).map((l) => ({ itemId: String(l.itemId), quantity: l.quantity, unitCostKobo: l.unitCostKobo })),
  deliveryKobo: e.deliveryKobo ?? 0,
  amountKobo: e.amountKobo,
  method: e.method,
  paymentStatus: e.paymentStatus,
  paidOn: e.paidOn ?? null,
  notes: e.notes ?? "",
  receipt: e.receipt ? { url: e.receipt.url, name: e.receipt.name ?? "" } : null,
  automatic: !!e.source?.kind,
  capital: e.capital ?? false,
  createdAt: (e.createdAt ?? new Date(0)).toISOString(),
});

/** The farm's expenses, newest first; `supplierId` narrows them to one supplier. */
export async function listExpenses(farmId: string, { supplierId }: { supplierId?: string } = {}) {
  await connectDb();
  const filter = { farmId, ...(supplierId && Types.ObjectId.isValid(supplierId) && { supplierId }) };
  const docs = await ExpenseModel.find(filter).sort({ date: -1, createdAt: -1 }).lean();
  return docs.map((d) => view(d as unknown as Doc));
}

export async function getExpense(farmId: string, id: string) {
  await connectDb();
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = await ExpenseModel.findOne({ _id: id, farmId }).lean();
  return doc ? view(doc as unknown as Doc) : null;
}

/** What the farm owes each supplier (unpaid or failed), and what's on its way to them. */
export async function supplierBalances(farmId: string) {
  await connectDb();
  const rows = await ExpenseModel.aggregate<{
    _id: Types.ObjectId;
    owedKobo: number;
    sendingKobo: number;
    count: number;
  }>([
    { $match: { farmId: new Types.ObjectId(farmId), supplierId: { $ne: null } } },
    {
      $group: {
        _id: "$supplierId",
        owedKobo: { $sum: { $cond: [{ $in: ["$paymentStatus", ["unpaid", "failed"]] }, "$amountKobo", 0] } },
        sendingKobo: { $sum: { $cond: [{ $in: ["$paymentStatus", ["paying", "otp"]] }, "$amountKobo", 0] } },
        count: { $sum: 1 },
      },
    },
  ]);
  return new Map(
    rows.map((r) => [String(r._id), { owedKobo: r.owedKobo, sendingKobo: r.sendingKobo, count: r.count }]),
  );
}

function clean(input: Record<string, unknown>, today: string) {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : (v ?? ""));
  const id = (v: unknown) => (v === "" || v === undefined ? null : v);
  const lines = Array.isArray(input.lines)
    ? input.lines.map((l: Record<string, unknown>) => ({
        itemId: l?.newItem ? "" : l?.itemId,
        quantity: l?.quantity,
        unitCostKobo: l?.unitCostKobo,
        ...(l?.newItem && typeof l.newItem === "object"
          ? { newItem: { reorderLevel: null, notes: "", ...(l.newItem as object) } }
          : {}),
      }))
    : input.lines;
  const values = {
    date: input.date === undefined || input.date === "" ? today : input.date,
    category: input.category ?? (Array.isArray(lines) && lines.length ? "other" : undefined),
    description: text(input.description),
    supplierId: id(input.supplierId),
    payeeName: text(input.payeeName),
    // A saved supplier's account wins; a bank account typed in is for paying someone who isn't one.
    payeeBank: input.supplierId ? null : (input.payeeBank ?? null),
    batchId: id(input.batchId),
    lines: lines ?? [],
    deliveryKobo: input.deliveryKobo === "" || input.deliveryKobo === undefined ? 0 : input.deliveryKobo,
    amountKobo: input.amountKobo === "" || input.amountKobo === undefined ? 0 : input.amountKobo,
    method: input.method,
    notes: text(input.notes),
    receipt: input.receipt ?? null,
  } as Record<keyof ExpenseInput, unknown>;
  const errors = validateExpense(values, { today });
  const [field] = Object.keys(errors);
  if (field) throw new HttpError(400, "invalid_expense", errors[field as keyof typeof errors]!, field);
  const receipt = values.receipt as ExpenseInput["receipt"];
  if (
    receipt !== null &&
    (typeof receipt !== "object" ||
      typeof receipt.url !== "string" ||
      !/^(https:\/\/|\/api\/uploads\/)/.test(receipt.url))
  )
    throw new HttpError(400, "invalid_expense", "Attach the receipt again.", "receipt");
  return values as unknown as ExpenseInput;
}

/** Checks a purchase's items, supplier and batch belong to the farm; fills the category and description. */
type NewItem = ItemInput & { _id: Types.ObjectId; nameKey: string };

async function resolve(farmId: string, values: ExpenseInput, created: NewItem[] = []) {
  // Something new bought: the farm's item of that name if there is one, else one made with the purchase.
  for (const l of values.lines) {
    if (!l.newItem) continue;
    const name = tidyName(l.newItem.name);
    const existing = await InventoryItemModel.findOne({ farmId, nameKey: nameKey(name) }, { _id: 1 }).lean();
    if (existing) l.itemId = String(existing._id);
    else {
      const twin = created.find((c) => c.nameKey === nameKey(name));
      const _id = twin?._id ?? new Types.ObjectId();
      if (!twin)
        created.push({
          _id,
          ...l.newItem,
          name,
          nameKey: nameKey(name),
          unitKg: l.newItem.unitKg ?? null,
          reorderLevel: l.newItem.reorderLevel ?? null,
          notes: l.newItem.notes ?? "",
        });
      l.itemId = String(_id);
    }
    delete l.newItem;
  }
  const items = values.lines.length
    ? await InventoryItemModel.find({
        farmId,
        _id: { $in: values.lines.map((l) => (Types.ObjectId.isValid(l.itemId) ? l.itemId : null)) },
      }).lean()
    : [];
  const byId = new Map(
    [...items, ...created].map((i) => [
      String(i._id),
      { name: i.name, unit: i.unit, category: i.category as Category },
    ]),
  );
  values.lines.forEach((l, i) => {
    if (!byId.has(l.itemId))
      throw new HttpError(400, "invalid_expense", "Choose an item from your stock.", `lines.${i}`);
  });
  if (values.lines.length) {
    // The category of what cost most; the description lists what was bought.
    const spend = new Map<ExpenseCategory, number>();
    for (const l of values.lines) {
      const c = CATEGORY_FOR_ITEM[byId.get(l.itemId)!.category];
      spend.set(c, (spend.get(c) ?? 0) + l.quantity * l.unitCostKobo);
    }
    values.category = [...spend].sort((a, b) => b[1] - a[1])[0][0];
    values.description = values.description || describeLines(values.lines, byId);
    values.amountKobo = expenseTotal(values);
  }
  const supplier =
    values.supplierId === null
      ? null
      : Types.ObjectId.isValid(values.supplierId)
        ? await SupplierModel.findOne({ _id: values.supplierId, farmId }).lean()
        : null;
  if (values.supplierId !== null && !supplier)
    throw new HttpError(400, "invalid_expense", "Choose a supplier on the farm.", "supplierId");
  if (values.batchId !== null) {
    const batch = Types.ObjectId.isValid(values.batchId)
      ? await BatchModel.findOne({ _id: values.batchId, farmId }).lean()
      : null;
    if (!batch) throw new HttpError(400, "invalid_expense", "Choose a batch on the farm.", "batchId");
    if (batch.status === "closed")
      throw new HttpError(409, "closed", `${batch.code} is closed, so new costs can't be charged to it.`, "batchId");
  }
  return supplier;
}

/**
 * Records money spent or owed. A purchase's lines raise stock (at what they cost) in the same
 * transaction: both are saved, or neither. `method` says how it was paid: cash, a transfer outside
 * Fowlex or POS (paid), "later" (owed), or "paystack" (owed until the transfer, sent next by an
 * owner, lands). A resent request (`requestId`) returns the one already saved.
 */
export async function createExpense(
  actor: CurrentUser,
  input: Record<string, unknown>,
  { requestId }: { requestId?: string } = {},
  today = lagosToday(),
): Promise<{ expense: ExpenseView; created: boolean }> {
  await connectDb();
  const rid = typeof requestId === "string" && /^[\w-]{8,64}$/.test(requestId) ? requestId : null;
  const sent = async () =>
    rid ? await ExpenseModel.findOne({ farmId: actor.farmId, clientRequestId: rid }).lean() : null;
  const earlier = await sent();
  if (earlier) return { expense: view(earlier as unknown as Doc), created: false };

  const values = clean(input, today);
  if (values.method === "paystack" && !can(actor.role, "payout.send"))
    throw new HttpError(
      403,
      "forbidden",
      "Only the owners send money. Save it as not paid yet, and an owner can pay it.",
      "method",
    );
  const newItems: NewItem[] = [];
  let supplier = await resolve(actor.farmId, values, newItems);
  // Paying someone who isn't a saved supplier: their account is checked with the bank here, and
  // kept as a supplier only when asked.
  let payeeBank: (BankAccount & { recipientCode: string | null }) | null = null;
  if (values.payeeBank && !supplier) {
    if (input.saveSupplier === true) {
      supplier = await SupplierModel.findById(
        (
          await createSupplier(actor, {
            name: values.payeeName || "",
            bank: values.payeeBank,
          }).catch((error: HttpError) => {
            throw new HttpError(
              error.status,
              error.code,
              error.message,
              error.field === "name" ? "payeeName" : "payeeBank",
            );
          })
        ).id,
      ).lean();
      values.supplierId = String(supplier!._id);
      values.payeeName = "";
    } else {
      const account = await resolveAccount(values.payeeBank.accountNumber, values.payeeBank.bankCode).catch(
        (error: HttpError) => {
          throw new HttpError(error.status, error.code, error.message, "payeeBank");
        },
      );
      const recipientCode = await createRecipient(account).catch((error: HttpError) => {
        if (error.status === 503) return null;
        throw new HttpError(400, error.code, error.message, "payeeBank");
      });
      payeeBank = { ...account, recipientCode };
      values.payeeName = values.payeeName || account.accountName;
    }
  }
  if (values.method === "paystack" && !supplier?.bank && !payeeBank)
    throw new HttpError(
      400,
      "no_bank",
      supplier
        ? `Add ${supplier.name}'s bank account to pay them through Paystack.`
        : "Enter the bank account to pay through Paystack.",
      supplier ? "supplierId" : "payeeBank",
    );

  // Equipment bought outright (not stock) can be tracked as an asset, depreciated over its life.
  const asset =
    input.asset && !values.lines.length && values.category === "equipment"
      ? checkAssetFromExpense(input.asset, values, today)
      : null;
  const paid = ["cash", "transfer", "pos"].includes(values.method);
  try {
    const doc = await withTransaction(async (session) => {
      const year = values.date.slice(0, 4);
      const seq = await nextSequence(actor.farmId, `expense:${year}`, session);
      if (newItems.length)
        await InventoryItemModel.create(
          newItems.map((i) => ({ ...i, farmId: actor.farmId, createdBy: actor.id })),
          { session, ordered: true },
        );
      const [expense] = await ExpenseModel.create(
        [
          {
            ...values,
            payeeBank,
            number: `EXP-${year}-${String(seq).padStart(4, "0")}`,
            paymentStatus: paid ? "paid" : "unpaid",
            paidOn: paid ? values.date : null,
            capital: !!asset,
            farmId: actor.farmId,
            createdBy: actor.id,
            clientRequestId: rid,
          },
        ],
        { session },
      );
      if (values.lines.length)
        await StockMovementModel.create(
          values.lines.map((l) => ({
            farmId: actor.farmId,
            createdBy: actor.id,
            itemId: l.itemId,
            type: "purchase",
            date: values.date,
            quantity: l.quantity,
            unitCostKobo: l.unitCostKobo,
            batchId: values.batchId,
            source: { kind: "purchase", id: expense._id },
          })),
          { session, ordered: true },
        );
      if (asset) await createAssetFromExpense(session, actor, asset, expense._id);
      return expense;
    });
    return { expense: view(doc.toObject() as unknown as Doc), created: true };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const again = await sent();
      if (again) return { expense: view(again as unknown as Doc), created: false };
    }
    throw error;
  }
}

async function load(actor: CurrentUser, id: string) {
  await connectDb();
  const doc = Types.ObjectId.isValid(id) ? await ExpenseModel.findOne({ _id: id, farmId: actor.farmId }) : null;
  if (!doc) throw new HttpError(404, "not_found", "That expense doesn't exist any more.");
  return doc;
}

/**
 * Changes what doesn't move money or stock: notes, the receipt, the batch it's charged to and the
 * payee's name. Anything else is deleted and recorded again.
 */
export async function updateExpense(actor: CurrentUser, id: string, input: Record<string, unknown>, version: unknown) {
  const doc = await load(actor, id);
  if (typeof version !== "number" || version !== doc.__v)
    throw new HttpError(409, "stale", "Someone changed this expense while you were editing. Open it again.");
  if (doc.source?.kind) throw new HttpError(409, "automatic", "Fowlex keeps this one in step with its transfer.");
  const current = view(doc.toObject() as unknown as Doc);
  const values = clean(
    { ...current, ...pick(input, ["notes", "receipt", "batchId", "payeeName"]), date: current.date },
    "9999-12-31",
  );
  if (values.batchId !== current.batchId) await resolve(actor.farmId, { ...values, lines: [], supplierId: null });
  doc.set({ notes: values.notes, receipt: values.receipt, batchId: values.batchId, payeeName: values.payeeName });
  try {
    await doc.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError")
      throw new HttpError(409, "stale", "Someone changed this expense while you were editing. Open it again.");
    throw error;
  }
  return view(doc.toObject() as unknown as Doc);
}

const pick = (o: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

/** Records that an owed expense was paid outside Fowlex (cash, a bank transfer, POS). */
export async function markPaid(actor: CurrentUser, id: string, input: Record<string, unknown>, today = lagosToday()) {
  const doc = await load(actor, id);
  if (doc.paymentStatus === "paid") throw new HttpError(409, "paid", `${doc.number} is already paid.`);
  if (doc.paymentStatus === "paying" || doc.paymentStatus === "otp")
    throw new HttpError(409, "paying", "A Paystack transfer for this is on its way. Wait for it to land or fail.");
  const method = input.method;
  if (method !== "cash" && method !== "transfer" && method !== "pos")
    throw new HttpError(400, "invalid_expense", "Choose how it was paid.", "method");
  const paidOn = input.paidOn === undefined || input.paidOn === "" ? today : input.paidOn;
  if (typeof paidOn !== "string" || !isISODate(paidOn) || paidOn > today || paidOn < doc.date)
    throw new HttpError(
      400,
      "invalid_expense",
      "Choose the day it was paid, from the expense's day to today.",
      "paidOn",
    );
  doc.set({ method, paymentStatus: "paid", paidOn });
  await doc.save();
  return view(doc.toObject() as unknown as Doc);
}

/**
 * Removes an expense and the stock it brought in (kept, hidden and audited). Not one paid, or
 * being paid, through Paystack: that money has moved.
 */
export async function deleteExpense(actor: CurrentUser, id: string) {
  const doc = await load(actor, id);
  if (doc.source?.kind) throw new HttpError(409, "automatic", "Fowlex keeps this one in step with its transfer.");
  if (await PayoutModel.exists({ expenseId: doc._id, status: { $in: ["pending", "otp", "success"] } }))
    throw new HttpError(409, "has_payout", "Money for this went through Paystack, so it stays on record.");
  await withTransaction(async (session) => {
    doc.$session(session);
    await doc.softDelete();
    const movements = await StockMovementModel.find({ "source.kind": "purchase", "source.id": doc._id }).session(
      session,
    );
    for (const m of movements) await m.softDelete();
    const assets = await AssetModel.find({ expenseId: doc._id }).session(session);
    for (const a of assets) await a.softDelete();
  });
}
