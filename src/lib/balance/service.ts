import "server-only";

import { Types } from "mongoose";

import { type Channel, type Direction, type EntryCategory, signed, type TopUpAccount, validateTopUp } from "./rules";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { connectDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatNaira } from "@/lib/money";
import { paystackMode } from "@/lib/paystack/client";
import { topUpSimulator } from "@/lib/paystack/simulator";
import { getBalance, type LedgerRow, readLedger } from "@/lib/paystack/transfers";
import { BalanceEntryModel } from "@/models/balance-entry";
import { ExpenseModel } from "@/models/expense";
import { PaystackAccountModel } from "@/models/paystack-account";
import { PayoutModel } from "@/models/payout";
import { UserModel } from "@/models/user";

type Mode = "live" | "test" | "simulated";

/** The Paystack this server talks to, or a plain refusal when payments aren't set up. */
function modeNow(): Mode {
  const mode = paystackMode();
  if (mode === "off")
    throw new HttpError(503, "paystack_off", "Payments aren't set up yet: add the Paystack secret key.");
  return mode;
}

export type EntryView = {
  id: string;
  direction: Direction;
  category: EntryCategory;
  amountKobo: number;
  /** Paystack's balance after it, when its ledger has shown it; else Fowlex's running figure. */
  balanceAfterKobo: number;
  confirmed: boolean;
  occurredAt: string;
  description: string;
  channel: Channel;
  initiatedBy: string;
  counterparty: { name: string; bankName: string; accountNumber: string } | null;
  expenseId: string | null;
  payoutId: string | null;
  paystack: {
    ledgerId: string | null;
    reference: string | null;
    transferCode: string | null;
    transferId: string | null;
    reason: string;
  };
};

type EntryDoc = {
  _id: unknown;
  direction: Direction;
  category: EntryCategory;
  amountKobo: number;
  balanceAfterKobo?: number | null;
  status: "pending" | "confirmed";
  occurredAt: Date;
  description?: string;
  channel: Channel;
  initiatedByName?: string;
  counterparty?: { name?: string; bankName?: string; accountNumber?: string } | null;
  expenseId?: unknown;
  payoutId?: unknown;
  paystack?: {
    ledgerId?: string | null;
    reference?: string | null;
    transferCode?: string | null;
    transferId?: string | null;
    reason?: string;
  };
};

const view = (e: EntryDoc, running: number): EntryView => ({
  id: String(e._id),
  direction: e.direction,
  category: e.category,
  amountKobo: e.amountKobo,
  balanceAfterKobo: e.balanceAfterKobo ?? running,
  confirmed: e.status === "confirmed",
  occurredAt: e.occurredAt.toISOString(),
  description: e.description ?? "",
  channel: e.channel,
  initiatedBy: e.initiatedByName ?? "",
  counterparty: e.counterparty
    ? {
        name: e.counterparty.name ?? "",
        bankName: e.counterparty.bankName ?? "",
        accountNumber: e.counterparty.accountNumber ?? "",
      }
    : null,
  expenseId: e.expenseId ? String(e.expenseId) : null,
  payoutId: e.payoutId ? String(e.payoutId) : null,
  paystack: {
    ledgerId: e.paystack?.ledgerId ?? null,
    reference: e.paystack?.reference ?? null,
    transferCode: e.paystack?.transferCode ?? null,
    transferId: e.paystack?.transferId ?? null,
    reason: e.paystack?.reason ?? "",
  },
});

const ordered = { occurredAt: 1, _id: 1 } as const;

/** Every movement in this mode, newest first, each with the balance it left. */
export async function listEntries(farmId: string): Promise<EntryView[]> {
  await connectDb();
  const mode = paystackMode();
  if (mode === "off") return [];
  const docs = (await BalanceEntryModel.find({ farmId, mode }).sort(ordered).lean()) as unknown as EntryDoc[];
  let running = 0;
  const views = docs.map((d) => {
    running += signed(d);
    return view(d, running);
  });
  return views.reverse();
}

export type BalanceSummary = {
  mode: Mode | "off";
  opened: boolean;
  /** What Paystack said the balance was at the last check. */
  paystackKobo: number | null;
  /** What Fowlex's book adds up to. */
  fowlexKobo: number;
  /** Paystack's figure less Fowlex's: zero when they match. */
  differenceKobo: number | null;
  pending: number;
  syncedAt: string | null;
  topUp: TopUpAccount | null;
};

/** The balance as Paystack and Fowlex each see it, and whether they match. */
export async function balanceSummary(farmId: string): Promise<BalanceSummary> {
  await connectDb();
  const mode = paystackMode();
  if (mode === "off")
    return {
      mode,
      opened: false,
      paystackKobo: null,
      fowlexKobo: 0,
      differenceKobo: null,
      pending: 0,
      syncedAt: null,
      topUp: null,
    };
  const [account, totals] = await Promise.all([
    PaystackAccountModel.findOne({ farmId, mode }).lean(),
    BalanceEntryModel.aggregate<{ _id: null; kobo: number; pending: number }>([
      { $match: { farmId: new Types.ObjectId(farmId), mode } },
      {
        $group: {
          _id: null,
          kobo: {
            $sum: { $cond: [{ $eq: ["$direction", "credit"] }, "$amountKobo", { $multiply: ["$amountKobo", -1] }] },
          },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const fowlexKobo = totals[0]?.kobo ?? 0;
  const paystackKobo = account?.paystackBalanceKobo ?? null;
  return {
    mode,
    opened: !!account?.openedAt,
    paystackKobo,
    fowlexKobo,
    differenceKobo: account?.openedAt && paystackKobo !== null ? paystackKobo - fowlexKobo : null,
    pending: totals[0]?.pending ?? 0,
    syncedAt: account?.syncedAt ? account.syncedAt.toISOString() : null,
    topUp: account?.topUp
      ? {
          bankName: account.topUp.bankName,
          accountNumber: account.topUp.accountNumber,
          accountName: account.topUp.accountName,
        }
      : null,
  };
}

async function accountFor(farmId: string, mode: Mode) {
  return PaystackAccountModel.findOneAndUpdate(
    { farmId, mode },
    { $setOnInsert: { farmId, mode } },
    { upsert: true, returnDocument: "after" },
  );
}

/** Books an entry once by its key; false when it was already there. */
async function book(entry: Record<string, unknown>) {
  try {
    await BalanceEntryModel.create(entry);
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

type PayoutDoc = {
  _id: Types.ObjectId;
  farmId: Types.ObjectId;
  createdBy?: Types.ObjectId | null;
  expenseId: Types.ObjectId;
  reference: string;
  transferCode?: string | null;
  transferId?: string | null;
  amountKobo: number;
  feeKobo?: number;
  recipient: { accountName: string; bankName?: string; accountNumber: string };
};

/** What a payout's entries say about it: who it went to, who sent it, and the expense behind it. */
async function about(p: PayoutDoc) {
  const [expense, user] = await Promise.all([
    ExpenseModel.findById(p.expenseId, { number: 1, description: 1 }).setOptions({ withDeleted: true }).lean(),
    p.createdBy ? UserModel.findById(p.createdBy, { name: 1 }).lean() : null,
  ]);
  return {
    number: expense?.number ?? "",
    common: {
      farmId: p.farmId,
      createdBy: p.createdBy ?? null,
      channel: "fowlex" as const,
      initiatedByName: user?.name ?? "",
      counterparty: {
        name: p.recipient.accountName,
        bankName: p.recipient.bankName ?? "",
        accountNumber: p.recipient.accountNumber,
      },
      expenseId: p.expenseId,
      payoutId: p._id,
    },
  };
}

const describe = (category: EntryCategory, name: string, number: string) =>
  category === "transfer"
    ? `To ${name}${number ? `: ${number}` : ""}`
    : category === "transfer_fee"
      ? `Paystack fee for paying ${name}${number ? ` (${number})` : ""}`
      : `Returned: transfer to ${name}${number ? ` (${number})` : ""}`;

/** Only once the book is open: before that, the opening balance takes in whatever happened. */
async function bookOpen(farmId: Types.ObjectId, mode: Mode) {
  return !!(await PaystackAccountModel.exists({ farmId, mode, openedAt: { $ne: null } }));
}

/**
 * Paystack has taken a transfer: the money and its fee leave the balance now. Booked as pending
 * (Fowlex's word for it) until Paystack's ledger shows the rows, which confirm them with the exact
 * fee and balance. Never throws: the book must not stand in the way of a payment.
 */
export async function recordTransferSent(reference: string) {
  try {
    await connectDb();
    const mode = paystackMode();
    if (mode === "off") return;
    const p = (await PayoutModel.findOne({ reference }).lean()) as unknown as PayoutDoc | null;
    if (!p || !(await bookOpen(p.farmId, mode))) return;
    const { number, common } = await about(p);
    const paystack = { reference: p.reference, transferCode: p.transferCode ?? null, transferId: p.transferId ?? null };
    const fee = p.feeKobo || estimatedFee(p.amountKobo);
    for (const [category, amountKobo] of [
      ["transfer", p.amountKobo],
      ["transfer_fee", fee],
    ] as const)
      await book({
        ...common,
        mode,
        key: `payout:${p.reference}:${category}`,
        direction: "debit",
        category,
        amountKobo,
        status: "pending",
        occurredAt: new Date(),
        description: describe(category, p.recipient.accountName, number),
        paystack,
      });
  } catch (error) {
    console.error("[balance] recording a transfer", error);
  }
}

/** ₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above (Paystack's Nigerian transfer fees). */
const estimatedFee = (amountKobo: number) => (amountKobo <= 500_000 ? 1_000 : amountKobo <= 5_000_000 ? 2_500 : 5_000);

/**
 * A transfer that didn't go: what Fowlex booked and Paystack never confirmed comes off. If the
 * money did leave and came back, Paystack's ledger shows both, and the sync books them. A transfer
 * returned after it landed books the money coming back (pending until the ledger shows it).
 */
export async function recordTransferUndone(reference: string, how: "failed" | "reversed") {
  try {
    await connectDb();
    const mode = paystackMode();
    if (mode === "off") return;
    const p = (await PayoutModel.findOne({ reference }).lean()) as unknown as PayoutDoc | null;
    if (!p) return;
    if (how === "failed") {
      const unconfirmed = await BalanceEntryModel.find({ payoutId: p._id, mode, status: "pending" });
      for (const e of unconfirmed) await e.softDelete();
      return;
    }
    if (!(await bookOpen(p.farmId, mode))) return;
    const { number, common } = await about(p);
    await book({
      ...common,
      mode,
      key: `payout:${p.reference}:transfer_reversal`,
      direction: "credit",
      category: "transfer_reversal",
      amountKobo: p.amountKobo,
      status: "pending",
      occurredAt: new Date(),
      description: describe("transfer_reversal", p.recipient.accountName, number),
      paystack: { reference: p.reference, transferCode: p.transferCode ?? null, transferId: p.transferId ?? null },
    });
  } catch (error) {
    console.error("[balance] recording a returned transfer", error);
  }
}

/** What a Paystack ledger row is, from its model and reason, and whether Fowlex sent it. */
function classify(row: LedgerRow, payout: PayoutDoc | null, mode: Mode): { category: EntryCategory; channel: Channel } {
  const text = `${row.model} ${row.reason}`;
  const credit = row.differenceKobo > 0;
  if (/transfer/i.test(row.model)) {
    const channel = payout ? "fowlex" : "paystack";
    if (credit) return { category: "transfer_reversal", channel };
    if (payout)
      return { category: Math.abs(row.differenceKobo) === payout.amountKobo ? "transfer" : "transfer_fee", channel };
    return { category: /charge|fee/i.test(row.reason) ? "transfer_fee" : "transfer", channel };
  }
  if (/top.?up|external|funding/i.test(text) && credit)
    return { category: "funding", channel: mode === "simulated" ? "simulator" : "bank-transfer" };
  if (/refund/i.test(text)) return { category: "refund", channel: "paystack" };
  if (/transaction|payment/i.test(row.model))
    return credit
      ? { category: "collection", channel: "paystack" }
      : { category: "collection_fee", channel: "paystack" };
  if (!credit && /charge|fee|verification|service/i.test(text))
    return { category: "service_charge", channel: "paystack" };
  return { category: "other", channel: "paystack" };
}

/** The Fowlex transfer behind a ledger row: by Paystack's transfer id, else the expense number in its reason. */
async function payoutFor(farmId: Types.ObjectId, row: LedgerRow): Promise<PayoutDoc | null> {
  if (!/transfer/i.test(row.model)) return null;
  if (row.modelRow) {
    const byId = await PayoutModel.findOne({ farmId, transferId: row.modelRow }).lean();
    if (byId) return byId as unknown as PayoutDoc;
  }
  const number = /EXP-\d{4}-\d+/.exec(row.reason)?.[0];
  if (!number) return null;
  const expense = await ExpenseModel.findOne({ farmId, number }, { _id: 1 }).setOptions({ withDeleted: true }).lean();
  if (!expense) return null;
  return (await PayoutModel.findOne({ farmId, expenseId: expense._id })
    .sort({ createdAt: -1 })
    .lean()) as unknown as PayoutDoc | null;
}

/**
 * Books one Paystack ledger row: confirms the entry Fowlex booked for it, or adds it. Says whether
 * it added an entry, and the amount when that was funding.
 */
async function importRow(
  farmId: Types.ObjectId,
  mode: Mode,
  row: LedgerRow,
): Promise<{ added: boolean; fundedKobo: number | null }> {
  const none = { added: false, fundedKobo: null };
  if (await BalanceEntryModel.exists({ farmId, mode, "paystack.ledgerId": row.id })) return none;
  const payout = await payoutFor(farmId, row);
  const { category, channel } = classify(row, payout, mode);
  const confirmed = {
    status: "confirmed",
    amountKobo: Math.abs(row.differenceKobo),
    balanceAfterKobo: Number.isFinite(row.balanceKobo) ? row.balanceKobo : null,
    occurredAt: row.at,
    "paystack.ledgerId": row.id,
    "paystack.model": row.model,
    "paystack.modelRow": row.modelRow,
    "paystack.reason": row.reason,
    "paystack.raw": row.raw,
  };
  if (payout) {
    if (row.modelRow && !payout.transferId)
      await PayoutModel.updateOne({ _id: payout._id }, { $set: { transferId: row.modelRow } });
    const mine = await BalanceEntryModel.findOneAndUpdate(
      { farmId, mode, payoutId: payout._id, category, status: "pending" },
      { $set: confirmed },
      { returnDocument: "after" },
    );
    if (mine) return none;
  }
  const extra = payout ? await about(payout) : null;
  const description =
    payout && extra
      ? describe(category, payout.recipient.accountName, extra.number)
      : category === "funding"
        ? "Balance top-up"
        : row.reason || category;
  const entry = {
    ...(extra?.common ?? { farmId, createdBy: null, channel, initiatedByName: "", counterparty: null }),
    channel: payout ? "fowlex" : channel,
    mode,
    key: `ledger:${row.id}`,
    direction: row.differenceKobo > 0 ? "credit" : "debit",
    category,
    description,
    amountKobo: Math.abs(row.differenceKobo),
    balanceAfterKobo: Number.isFinite(row.balanceKobo) ? row.balanceKobo : null,
    status: "confirmed",
    occurredAt: row.at,
    paystack: {
      ledgerId: row.id,
      reference: payout?.reference ?? null,
      transferCode: payout?.transferCode ?? null,
      transferId: row.modelRow,
      model: row.model,
      modelRow: row.modelRow,
      reason: row.reason,
      raw: row.raw,
    },
  };
  const added = await book(entry);
  return { added, fundedKobo: added && category === "funding" ? entry.amountKobo : null };
}

export type SyncResult = { opened: boolean; added: number; fundedKobo: number[] };

/**
 * Brings the book up to Paystack: the first time, opens it at Paystack's balance; after that,
 * reads Paystack's ledger from where it stopped, confirming what Fowlex booked and adding what it
 * didn't (top-ups, transfers made in the Paystack Dashboard, charges), then notes Paystack's
 * balance to compare. Funding that came in is emailed to the owners.
 */
export async function syncBalance(farmId: string): Promise<SyncResult> {
  await connectDb();
  const mode = modeNow();
  const account = await accountFor(farmId, mode);
  const fid = new Types.ObjectId(farmId);
  if (!account.openedAt) {
    const balance = await getBalance();
    const now = new Date();
    // Claimed, so two first syncs at once open the book once.
    const claimed = await PaystackAccountModel.findOneAndUpdate(
      { _id: account._id, openedAt: null },
      { $set: { openedAt: now, readUpTo: now, syncedAt: now, paystackBalanceKobo: balance } },
      { returnDocument: "after" },
    );
    if (claimed)
      await book({
        farmId: fid,
        mode,
        key: "opening",
        direction: "credit",
        category: "opening",
        amountKobo: Math.max(balance, 0),
        balanceAfterKobo: balance,
        status: "confirmed",
        occurredAt: now,
        description: "Paystack balance when Fowlex started keeping its book",
        channel: "paystack",
      });
    return { opened: true, added: 0, fundedKobo: [] };
  }

  const rows = (await readLedger(account.readUpTo ?? account.openedAt)).filter((r) => r.at > account.openedAt!);
  const fundedKobo: number[] = [];
  let added = 0;
  for (const row of rows) {
    const result = await importRow(fid, mode, row);
    if (result.added) added++;
    if (result.fundedKobo) fundedKobo.push(result.fundedKobo);
  }
  const balance = await getBalance();
  const newest = rows.at(-1)?.at;
  await PaystackAccountModel.updateOne(
    { _id: account._id },
    {
      $set: {
        syncedAt: new Date(),
        paystackBalanceKobo: balance,
        ...(newest && (!account.readUpTo || newest > account.readUpTo) && { readUpTo: newest }),
      },
    },
  );
  if (fundedKobo.length) await tellOwners(fid, fundedKobo, balance);
  return { opened: false, added, fundedKobo };
}

async function tellOwners(farmId: Types.ObjectId, fundedKobo: number[], balanceKobo: number) {
  const owners = await UserModel.find({ farmId, role: "owner", status: "active" }, { email: 1, name: 1 }).lean();
  const total = fundedKobo.reduce((a, b) => a + b, 0);
  for (const owner of owners)
    await sendEmail({
      to: owner.email,
      subject: `Paystack balance funded: ${formatNaira(total)}`,
      text: `Hi ${owner.name},\n\n${formatNaira(total)} has landed in the farm's Paystack balance. It now holds ${formatNaira(balanceKobo)}, ready to pay suppliers and staff from Fowlex.\n\nFowlex`,
    }).catch((error) => console.error("[balance] funding email", error));
}

/** Every farm whose book is open in this mode: for the webhook and the daily check. */
export async function syncAllBalances() {
  await connectDb();
  const mode = paystackMode();
  if (mode === "off") return 0;
  const accounts = await PaystackAccountModel.find({ mode, openedAt: { $ne: null } }, { farmId: 1 }).lean();
  let synced = 0;
  for (const a of accounts) {
    await syncBalance(String(a.farmId)).then(
      () => synced++,
      (error) => console.error("[balance] sync", String(a.farmId), error),
    );
  }
  return synced;
}

/** Saves the top-up account the Paystack Dashboard shows, for this mode (live and test differ). */
export async function saveTopUp(actor: CurrentUser, input: Partial<TopUpAccount>) {
  await connectDb();
  const mode = modeNow();
  const errors = validateTopUp(input);
  const first = Object.entries(errors)[0];
  if (first) throw new HttpError(400, "invalid", first[1]!, first[0]);
  const topUp = {
    bankName: input.bankName!.trim(),
    accountNumber: input.accountNumber!.replace(/\s/g, ""),
    accountName: input.accountName!.trim(),
  };
  const account = await accountFor(actor.farmId, mode);
  account.topUp = topUp;
  await account.save();
  return topUp;
}

/**
 * Test money into the balance. Only the simulator can make it: Paystack's test mode has no API
 * for it, so there it's topped up from Paystack's test Dashboard, and the sync picks it up.
 */
export async function addTestMoney(actor: CurrentUser, amountKobo: unknown) {
  await connectDb();
  const mode = modeNow();
  if (mode === "live") throw new HttpError(409, "live", "This is the live balance: fund it with real money.");
  if (mode === "test")
    throw new HttpError(
      409,
      "paystack_test",
      "In test mode, top up from your Paystack test Dashboard (Balance, then Top up) with a test card. Fowlex picks it up within a minute of you checking.",
    );
  if (
    typeof amountKobo !== "number" ||
    !Number.isInteger(amountKobo) ||
    amountKobo < 100 ||
    amountKobo > 100_000_000_00
  )
    throw new HttpError(400, "invalid_amount", "Enter an amount from ₦1 to ₦100,000,000.", "amountKobo");
  await syncBalance(actor.farmId); // Opens the book first, so the top-up counts as funding.
  topUpSimulator(amountKobo);
  return syncBalance(actor.farmId);
}
