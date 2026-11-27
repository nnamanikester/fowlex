import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBalance, verifyTransfer } from "./transfers";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
beforeEach(() => vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("paystack transfers", () => {
  it("reads the naira balance, and is unavailable when it can't", async () => {
    const fetch = vi.fn(async () =>
      json(200, {
        status: true,
        data: [
          { currency: "USD", balance: 5 },
          { currency: "NGN", balance: 900 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await getBalance()).toBe(900);
    fetch.mockImplementationOnce(async () => json(200, { status: true, data: [] }));
    expect(await getBalance()).toBe(0);
    fetch.mockImplementationOnce(async () => json(401, { status: false, message: "Invalid key" }));
    await expect(getBalance()).rejects.toMatchObject({ status: 503 });
  });

  it("verifies a transfer: its status and fee, null when unknown, unavailable on trouble", async () => {
    const fetch = vi.fn(async () =>
      json(200, { status: true, data: { status: "success", transfer_code: "TRF_1", fee_charged: 2500.4 } }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await verifyTransfer("fwx/1")).toEqual({ status: "success", transferCode: "TRF_1", feeKobo: 2500 });
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toContain("/transfer/verify/fwx%2F1");
    fetch.mockImplementationOnce(async () =>
      json(200, { status: true, data: { status: "pending", fee_charged: "n/a" } }),
    );
    expect(await verifyTransfer("x")).toEqual({ status: "pending", transferCode: null, feeKobo: 0 });
    fetch.mockImplementationOnce(async () => json(200, { status: true, data: {} }));
    expect(await verifyTransfer("x")).toEqual({ status: "", transferCode: null, feeKobo: 0 });
    fetch.mockImplementationOnce(async () => json(404, { status: false, message: "Transfer not found" }));
    expect(await verifyTransfer("x")).toBeNull();
    fetch.mockImplementationOnce(async () => json(500, { status: false }));
    await expect(verifyTransfer("x")).rejects.toMatchObject({ status: 503 });
  });
});
