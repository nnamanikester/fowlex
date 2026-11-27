import "server-only";

import { HttpError } from "@/lib/auth/guard";
import { simulate } from "./simulator";

/** What Paystack answered: never thrown on an HTTP error, so callers can tell "no" from "busy". */
export type PaystackResponse<T> = {
  httpStatus: number;
  status: boolean;
  message: string;
  data: T | null;
  meta?: { next?: string | null };
};

export type PaystackMode = "live" | "test" | "simulated" | "off";

/**
 * Which Paystack this server talks to: live or test keys, the built-in simulator (development and
 * the e2e suite, only when PAYSTACK_SIMULATE=1 says so), or none. Production never simulates.
 */
export function paystackMode(): PaystackMode {
  const key = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_") && key.length > "sk_test_".length) return "test";
  return process.env.PAYSTACK_SIMULATE === "1" ? "simulated" : "off";
}

export const TIMEOUT_MS = 10_000;
const BASE = "https://api.paystack.co";

/** Paystack couldn't be reached, timed out, or failed on its side: safe to try again. */
export const unavailable = () =>
  new HttpError(503, "paystack_unavailable", "Paystack isn't answering right now. Try again in a moment.");

/**
 * Calls Paystack's API with the secret key (server only). Resolves with the HTTP status and body
 * for any answer; rejects with a 503 HttpError when Paystack can't be reached or isn't set up.
 */
export async function paystack<T>(
  path: string,
  { method = "GET", body, query }: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string> } = {},
): Promise<PaystackResponse<T>> {
  const mode = paystackMode();
  if (mode === "off")
    throw new HttpError(503, "paystack_off", "Payments aren't set up yet: add the Paystack secret key.");
  const search = query ? `?${new URLSearchParams(query)}` : "";
  if (mode === "simulated") return simulate<T>(method, path, query ?? {}, body);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}${search}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    console.warn(`[paystack] ${method} ${path}: no answer (${(e as Error)?.name ?? "error"})`);
    throw unavailable();
  }
  const json = (await response.json().catch(() => ({}))) as Partial<PaystackResponse<T>>;
  return {
    httpStatus: response.status,
    status: json.status === true,
    message: typeof json.message === "string" ? json.message : "",
    data: (json.data as T) ?? null,
    meta: json.meta,
  };
}

/** True for answers that are Paystack's own trouble (5xx, rate limits), not a verdict on the request. */
export const isProviderTrouble = (res: PaystackResponse<unknown>) =>
  res.httpStatus >= 500 || res.httpStatus === 429 || /limit|too many/i.test(res.message);

/**
 * Why Paystack said no to something that isn't about the request itself, as the error to show.
 * Each cause gets words someone can act on: a key Paystack won't accept, a server address it
 * blocks, test mode's daily limit, or Paystack's own trouble. Paystack's answer is logged (never
 * the key), so the server's logs say what really happened.
 */
export function paystackTrouble(res: PaystackResponse<unknown>, what: string): HttpError {
  console.warn(`[paystack] ${what}: HTTP ${res.httpStatus} ${JSON.stringify(res.message)}`);
  if (res.httpStatus === 401 || /invalid key|authorization|secret key/i.test(res.message))
    return new HttpError(
      503,
      "paystack_key",
      "Paystack didn't accept the farm's Paystack key, so bank checks and payments can't work. Whoever set up Fowlex needs to put in the right secret key.",
    );
  if (res.httpStatus === 403 || /\bip\b|whitelist/i.test(res.message))
    return new HttpError(
      503,
      "paystack_blocked",
      "Paystack is blocking Fowlex's server. In Paystack's settings, turn off IP whitelisting for the API key, or allow Fowlex's server.",
    );
  if (paystackMode() === "test" && /limit|exceed/i.test(res.message))
    return new HttpError(
      503,
      "paystack_test_limit",
      "Paystack's test mode only checks a few bank accounts a day, and today's are used up. Try again tomorrow, or switch to live keys.",
    );
  return unavailable();
}
