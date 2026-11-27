import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { paystackMode } from "./client";
import { connectDb } from "@/lib/db";
import { syncAllBalances } from "@/lib/balance/service";
import { syncPayout } from "@/lib/payouts/service";
import { WebhookEventModel } from "@/models/webhook-event";

/** Paystack signs each webhook with HMAC-SHA512 of the raw body, keyed with the secret key. */
export function validSignature(rawBody: string, signature: string | null) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signature || paystackMode() === "simulated") return false;
  const expected = Buffer.from(createHmac("sha512", key).update(rawBody).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type Event = { event?: string; data?: { reference?: string; id?: number | string; status?: string } };

/**
 * Handles one webhook, once. Each event is stored by a key of its type, reference and status; a
 * repeat finds it handled and does nothing. For transfers the body is never trusted for the
 * outcome: Fowlex asks Paystack (verify) and settles from that. If that fails, the event is let go
 * so Paystack's retry is handled.
 */
export async function handleWebhook(payload: Event) {
  await connectDb();
  const event = String(payload.event ?? "");
  const reference = payload.data?.reference ?? null;
  const key = `${event}:${reference ?? payload.data?.id ?? ""}:${payload.data?.status ?? ""}`;
  try {
    await WebhookEventModel.create({ key, event, reference, payload });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const seen = await WebhookEventModel.findOne({ key }).lean();
      if (seen?.handledAt) return "duplicate";
    } else throw error;
  }
  try {
    if (event.startsWith("transfer.") && reference) await syncPayout(reference);
    await WebhookEventModel.updateOne({ key }, { $set: { handledAt: new Date(), error: "" } });
    // Anything Paystack tells us may have moved the balance: bring the book up to date.
    await syncAllBalances().catch((error) => console.error("[balance] after webhook", error));
    return "handled";
  } catch (error) {
    await WebhookEventModel.updateOne({ key }, { $set: { error: (error as Error).message } });
    throw error;
  }
}
