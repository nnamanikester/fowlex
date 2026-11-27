import "server-only";

import { Types } from "mongoose";

import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { today as lagosToday } from "@/lib/dates";
import { connectDb, withTransaction } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { isProviderTrouble, paystackMode } from "@/lib/paystack/client";
import { finalizeTransfer, getBalance, initiateTransfer, verifyTransfer } from "@/lib/paystack/transfers";
import { createRecipient } from "@/lib/paystack/banks";
import { payableRecipient } from "@/lib/suppliers/service";
import { nextSequence } from "@/models/counter";
import { ExpenseModel } from "@/models/expense";
import { PayoutModel } from "@/models/payout";
import { emailPayslip } from "@/lib/payroll/payslips";

export type PayoutView = {
  id: string;
  expenseId: string;
  reference: string;
  amountKobo: number;
  feeKobo: number;
  status: "pending" | "otp" | "success" | "failed" | "reversed";
  recipient: { accountName: string; bankName: string; accountNumber: string };
  failure: string;
  createdAt: string;
  settledAt: string | null;
};

type Doc = {
  _id: unknown;
  expenseId: unknown;
  reference: string;
  amountKobo: number;
  feeKobo?: number;
  status: PayoutView["status"];
  recipient: PayoutView["recipient"];
  failure?: string;
  createdAt?: Date;
  settledAt?: Date | null;
};
const view = (p: Doc): PayoutView => ({
  id: String(p._id),
  expenseId: String(p.expenseId),
  reference: p.reference,
  amountKobo: p.amountKobo,
  feeKobo: p.feeKobo ?? 0,
  status: p.status,
  recipient: {
    accountName: p.recipient.accountName,
    bankName: p.recipient.bankName,
    accountNumber: `••••${p.recipient.accountNumber.slice(-4)}`,
  },
  failure: p.failure ?? "",
  createdAt: (p.createdAt ?? new Date(0)).toISOString(),
  settledAt: p.settledAt ? p.settledAt.toISOString() : null,
});

/** An expense's transfers, newest first. */
export async function listPayouts(farmId: string, expenseId: string) {
  await connectDb();
  if (!Types.ObjectId.isValid(expenseId)) return [];
  const docs = await PayoutModel.find({ farmId, expenseId }).sort({ createdAt: -1 }).lean();
  return docs.map((d) => view(d as unknown as Doc));
}

/** What paying an expense would look like: who gets it, and whether the balance covers it. */
export async function payPreview(actor: CurrentUser, expenseId: string) {
  const expense = await payable(actor, expenseId);
  const { bank } = await recipientFor(actor, expense);
  const balanceKobo = await getBalance();
  return {
    amountKobo: expense.amountKobo,
    recipient: {
      accountName: bank.accountName,
      bankName: bank.bankName,
      accountNumber: `••••${bank.accountNumber.slice(-4)}`,
    },
    balanceKobo,
    enough: balanceKobo >= expense.amountKobo + feeFor(expense.amountKobo),
    feeKobo: feeFor(expense.amountKobo),
  };
}

/** Paystack's transfer fee: ₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above. */
export const feeFor = (amountKobo: number) => (amountKobo <= 500_000 ? 1_000 : amountKobo <= 5_000_000 ? 2_500 : 5_000);

async function payable(actor: CurrentUser, expenseId: string) {
  await connectDb();
  const expense = Types.ObjectId.isValid(expenseId)
    ? await ExpenseModel.findOne({ _id: expenseId, farmId: actor.farmId })
    : null;
  if (!expense) throw new HttpError(404, "not_found", "That expense doesn't exist any more.");
  if (expense.paymentStatus === "paid") throw new HttpError(409, "paid", `${expense.number} is already paid.`);
  if (expense.paymentStatus === "paying" || expense.paymentStatus === "otp")
    throw new HttpError(409, "paying", `A transfer for ${expense.number} is already on its way.`);
  if (expense.approval === "pending")
    throw new HttpError(409, "not_approved", `${expense.number} is waiting for approval. Approve it, then pay.`);
  if (expense.approval === "rejected")
    throw new HttpError(409, "rejected", `${expense.number} was rejected, so it isn't owed.`);
  if (!expense.supplierId && !expense.payeeBank)
    throw new HttpError(409, "no_bank", "Add the bank account to pay before sending money through Paystack.");
  return expense;
}

/**
 * Who a transfer goes to: the supplier's checked account, or the account kept on the expense for
 * someone who isn't a saved supplier. A Paystack recipient Paystack couldn't make earlier is made now.
 */
async function recipientFor(actor: CurrentUser, expense: Awaited<ReturnType<typeof payable>>) {
  if (expense.supplierId) return payableRecipient(actor.farmId, String(expense.supplierId));
  const bank = expense.payeeBank!;
  if (!bank.recipientCode) {
    bank.recipientCode = await createRecipient(bank);
    await ExpenseModel.updateOne({ _id: expense._id }, { $set: { "payeeBank.recipientCode": bank.recipientCode } });
  }
  return {
    recipientCode: bank.recipientCode,
    name: expense.payeeName || bank.accountName,
    bank: {
      bankCode: bank.bankCode,
      bankName: bank.bankName ?? "",
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
    },
  };
}

/**
 * Pays an owed expense to its supplier's bank account through Paystack. The payout is saved first
 * (pending, with a reference Paystack won't accept twice) and the expense marked as sending, in one
 * transaction; only then is the transfer asked for. Paystack's answer decides what happens next:
 * on its way (then settled by verify or the webhook), waiting for an OTP, or refused (the expense
 * is owed again, to retry). If Paystack doesn't answer, the payout stays pending and is checked,
 * never sent again blind.
 */
export async function payExpense(actor: CurrentUser, expenseId: string) {
  const expense = await payable(actor, expenseId);
  const { recipientCode, bank, name } = await recipientFor(actor, expense);
  const attempt = (await PayoutModel.countDocuments({ expenseId: expense._id }).setOptions({ withDeleted: true })) + 1;
  const reference = `fwx-${expense.number.toLowerCase()}-${attempt}`;

  let payout;
  try {
    payout = await withTransaction(async (session) => {
      const [p] = await PayoutModel.create(
        [
          {
            farmId: actor.farmId,
            createdBy: actor.id,
            expenseId: expense._id,
            supplierId: expense.supplierId ?? null,
            amountKobo: expense.amountKobo,
            reference,
            recipient: {
              code: recipientCode,
              accountName: bank.accountName,
              bankName: bank.bankName,
              accountNumber: bank.accountNumber,
            },
            reason: `${expense.number}: ${expense.description}`.slice(0, 100),
          },
        ],
        { session },
      );
      const moved = await ExpenseModel.updateOne(
        { _id: expense._id, paymentStatus: { $in: ["unpaid", "failed"] } },
        { $set: { paymentStatus: "paying", method: "paystack" } },
        { session },
      );
      if (!moved.modifiedCount)
        throw new HttpError(409, "paying", `A transfer for ${expense.number} is already on its way.`);
      return p;
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new HttpError(409, "paying", `A transfer for ${expense.number} is already on its way.`);
    throw error;
  }

  let res;
  try {
    res = await initiateTransfer({
      amountKobo: expense.amountKobo,
      recipient: recipientCode,
      reference,
      reason: `Fowlex ${expense.number} to ${name}`.slice(0, 100),
    });
  } catch {
    // No answer: the transfer may or may not exist. Leave it pending to be checked.
    return view((await PayoutModel.findById(payout._id).lean()) as unknown as Doc);
  }
  if (res.status && res.data?.status === "otp") {
    await settle(reference, "otp", { transferCode: res.data.transfer_code ?? null });
  } else if (res.status) {
    await PayoutModel.updateOne({ reference }, { $set: { transferCode: res.data?.transfer_code ?? null } });
    await syncPayout(reference).catch(() => undefined);
  } else if (/reference already exists/i.test(res.message) || isProviderTrouble(res)) {
    await syncPayout(reference).catch(() => undefined);
  } else {
    await settle(reference, "failed", { failure: refusal(res.message) });
  }
  return view((await PayoutModel.findById(payout._id).lean()) as unknown as Doc);
}

/** Paystack's refusal in words the owner can act on. */
export function refusal(message: string) {
  if (/invalid key|authorization|secret key/i.test(message))
    return "Paystack didn't accept the farm's Paystack key. Whoever set up Fowlex needs to put in the right secret key.";
  if (/\bip\b|whitelist/i.test(message))
    return "Paystack is blocking Fowlex's server. Turn off IP whitelisting for the API key in Paystack's settings.";
  if (/balance/i.test(message)) return "Your Paystack balance is too low. Top it up, then try again.";
  if (/otp/i.test(message)) return "Paystack wants an OTP for transfers. Try again, then enter the OTP it sends.";
  return message || "Paystack refused the transfer.";
}

/** Sends the OTP Paystack asked for, to release a transfer. */
export async function submitOtp(actor: CurrentUser, payoutId: string, otp: unknown) {
  await connectDb();
  const payout = Types.ObjectId.isValid(payoutId)
    ? await PayoutModel.findOne({ _id: payoutId, farmId: actor.farmId }).lean()
    : null;
  if (!payout) throw new HttpError(404, "not_found", "That transfer doesn't exist any more.");
  if (payout.status !== "otp") throw new HttpError(409, "not_waiting", "This transfer isn't waiting for an OTP.");
  if (typeof otp !== "string" || !/^\d{4,8}$/.test(otp.trim()))
    throw new HttpError(400, "invalid_otp", "Enter the OTP Paystack sent.", "otp");
  const res = await finalizeTransfer(payout.transferCode ?? "", otp.trim());
  if (!res.status) {
    if (isProviderTrouble(res))
      throw new HttpError(503, "paystack_unavailable", "Paystack isn't answering. Try again in a moment.");
    throw new HttpError(400, "invalid_otp", res.message || "Paystack didn't accept that OTP.", "otp");
  }
  await settle(payout.reference, "pending", {});
  await syncPayout(payout.reference).catch(() => undefined);
  return view((await PayoutModel.findById(payout._id).lean()) as unknown as Doc);
}

/**
 * Asks Paystack where a transfer stands and settles the payout to match. Used after sending, by
 * the Check button, and by the webhook (which never trusts its own body for the outcome).
 */
export async function syncPayout(reference: string) {
  await connectDb();
  const payout = await PayoutModel.findOne({ reference }).lean();
  if (!payout) return null;
  const found = await verifyTransfer(reference);
  if (!found) {
    // Paystack never got it. Only call it failed once a send in progress couldn't still land.
    if (payout.status === "pending" && Date.now() - payout.createdAt.getTime() > 2 * 60_000)
      await settle(reference, "failed", {
        failure: "The transfer never reached Paystack. Nothing was sent; try again.",
      });
    return view((await PayoutModel.findOne({ reference }).lean()) as unknown as Doc);
  }
  if (found.status === "success")
    await settle(reference, "success", { feeKobo: found.feeKobo, transferCode: found.transferCode });
  else if (found.status === "failed" || found.status === "abandoned" || found.status === "rejected")
    await settle(reference, "failed", { failure: "The bank didn't accept the transfer. Nothing was sent." });
  else if (found.status === "reversed")
    await settle(reference, "reversed", { failure: "The bank sent the money back." });
  else if (found.status === "otp") await settle(reference, "otp", { transferCode: found.transferCode });
  return view((await PayoutModel.findOne({ reference }).lean()) as unknown as Doc);
}

const FROM: Record<PayoutView["status"], PayoutView["status"][]> = {
  pending: ["otp"],
  otp: ["pending"],
  success: ["pending", "otp"],
  failed: ["pending", "otp"],
  reversed: ["pending", "otp", "success"],
};
const EXPENSE_STATUS = {
  pending: "paying",
  otp: "otp",
  success: "paid",
  failed: "failed",
  reversed: "failed",
} as const;

/**
 * Moves a payout to its new state, once: the guarded update means a repeat (a webhook sent twice,
 * a Check racing the webhook) changes nothing. The expense follows, and a successful transfer's
 * fee is booked as a bank-charges expense.
 */
export async function settle(
  reference: string,
  status: keyof typeof EXPENSE_STATUS,
  { feeKobo = 0, transferCode, failure }: { feeKobo?: number; transferCode?: string | null; failure?: string },
) {
  let paidExpense: string | null = null;
  await withTransaction(async (session) => {
    const payout = await PayoutModel.findOneAndUpdate(
      { reference, status: { $in: FROM[status] } },
      {
        $set: {
          status,
          ...(transferCode && { transferCode }),
          ...(status === "success" && { feeKobo, settledAt: new Date() }),
          ...((status === "failed" || status === "reversed") && { failure: failure ?? "", settledAt: new Date() }),
        },
      },
      { session, returnDocument: "after" },
    );
    if (!payout) return;
    if (status === "success") paidExpense = String(payout.expenseId);
    const today = lagosToday();
    await ExpenseModel.updateOne(
      { _id: payout.expenseId },
      { $set: { paymentStatus: EXPENSE_STATUS[status], paidOn: status === "success" ? today : null } },
      { session },
    );
    if (status !== "success" || !(feeKobo > 0)) return;
    const expense = await ExpenseModel.findById(payout.expenseId).session(session).lean();
    const year = today.slice(0, 4);
    const seq = await nextSequence(String(payout.farmId), `expense:${year}`, session);
    await ExpenseModel.create(
      [
        {
          farmId: payout.farmId,
          createdBy: payout.createdBy,
          number: `EXP-${year}-${String(seq).padStart(4, "0")}`,
          date: today,
          category: "bank-charges",
          description: `Paystack fee for paying ${expense?.number ?? ""} (${formatNaira(payout.amountKobo)})`,
          payeeName: "Paystack",
          batchId: expense?.batchId ?? null,
          amountKobo: feeKobo,
          method: "paystack",
          paymentStatus: "paid",
          paidOn: today,
          source: { kind: "payout-fee", id: payout._id },
        },
      ],
      { session },
    );
  });
  // Someone's pay landed: their payslip goes to them.
  if (paidExpense) await emailPayslip(paidExpense).catch((error) => console.error("[payslip email]", error));
}

/** True in the simulator, where no webhook comes: transfers are settled by checking at once. */
export const settlesBySync = () => paystackMode() === "simulated";
