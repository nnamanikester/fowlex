import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as payouts from "@/lib/payouts/service";
import { POST } from "@/app/api/webhooks/paystack/route";
import { WebhookEventModel } from "@/models/webhook-event";
import { setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret"));
afterEach(() => vi.unstubAllEnvs());

const send = (body: string, signature?: string) =>
  POST(
    new Request("http://localhost/api/webhooks/paystack", {
      method: "POST",
      body,
      headers: {
        "x-paystack-signature": signature ?? createHmac("sha512", "sk_test_secret").update(body).digest("hex"),
      },
    }),
  );
const event = JSON.stringify({
  event: "transfer.success",
  data: { reference: "fwx-exp-2026-0001-1", status: "success" },
});

describe("paystack webhook", () => {
  it("refuses a bad or missing signature (401), and a body that isn't JSON (400)", async () => {
    expect((await send(event, "nope")).status).toBe(401);
    expect((await send(event, "")).status).toBe(401);
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    vi.stubEnv("PAYSTACK_SIMULATE", "1");
    expect((await send(event)).status).toBe(401);
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret");
    expect((await send("{not json")).status).toBe(400);
  });

  it("settles a transfer by asking Paystack, and handles a repeat once", async () => {
    const sync = vi.spyOn(payouts, "syncPayout").mockResolvedValue(null);
    expect(await (await send(event)).json()).toEqual({ result: "handled" });
    expect(await (await send(event)).json()).toEqual({ result: "duplicate" });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith("fwx-exp-2026-0001-1");
    // Other events are kept, not acted on.
    expect(await (await send(JSON.stringify({ event: "charge.success", data: { id: 7 } }))).json()).toEqual({
      result: "handled",
    });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("asks Paystack to try again (500) when it can't be settled, then handles the retry", async () => {
    const sync = vi
      .spyOn(payouts, "syncPayout")
      .mockRejectedValueOnce(new Error("Paystack busy"))
      .mockResolvedValue(null);
    expect((await send(event)).status).toBe(500);
    expect(await WebhookEventModel.findOne().lean()).toMatchObject({ handledAt: null, error: "Paystack busy" });
    expect(await (await send(event)).json()).toEqual({ result: "handled" });
    expect(sync).toHaveBeenCalledTimes(2);
  });
});
