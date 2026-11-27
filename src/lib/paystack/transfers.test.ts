import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBalance, readLedger, verifyTransfer } from "./transfers";

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
      json(200, { status: true, data: { id: 77, status: "success", transfer_code: "TRF_1", fee_charged: 2500.4 } }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await verifyTransfer("fwx/1")).toEqual({
      status: "success",
      transferCode: "TRF_1",
      transferId: "77",
      feeKobo: 2500,
    });
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toContain("/transfer/verify/fwx%2F1");
    fetch.mockImplementationOnce(async () =>
      json(200, { status: true, data: { status: "pending", fee_charged: "n/a" } }),
    );
    expect(await verifyTransfer("x")).toEqual({ status: "pending", transferCode: null, transferId: null, feeKobo: 0 });
    fetch.mockImplementationOnce(async () => json(200, { status: true, data: {} }));
    expect(await verifyTransfer("x")).toEqual({ status: "", transferCode: null, transferId: null, feeKobo: 0 });
    fetch.mockImplementationOnce(async () => json(404, { status: false, message: "Transfer not found" }));
    expect(await verifyTransfer("x")).toBeNull();
    fetch.mockImplementationOnce(async () => json(500, { status: false }));
    await expect(verifyTransfer("x")).rejects.toMatchObject({ status: 503 });
  });

  it("reads the balance ledger oldest first, across pages, skipping rows it can't use", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret");
    const row = (id: number, at: string, difference = -100) => ({
      id,
      balance: 1000,
      difference,
      reason: "r",
      model_responsible: "Transfer",
      model_row: 9,
      createdAt: at,
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(200, {
          status: true,
          data: [row(3, "2026-11-27T10:00:00Z"), ...Array.from({ length: 99 }, (_, i) => row(100 + i, "2026-11-27T09:00:00Z"))],
          meta: { pageCount: 2 },
        }),
      )
      .mockResolvedValueOnce(
        json(200, {
          status: true,
          data: [row(1, "2026-11-26T10:00:00Z"), { id: 2, difference: "x", createdAt: "2026" }, { createdAt: "bad" }],
          meta: { pageCount: 2 },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const rows = await readLedger(new Date("2026-11-01T00:00:00Z"));
    expect(rows[0]).toMatchObject({ id: "1", differenceKobo: -100, model: "Transfer", modelRow: "9" });
    expect(rows.at(-1)?.id).toBe("3");
    expect(rows).toHaveLength(101);
    expect(String(fetch.mock.calls[0][0])).toContain("from=2026-11-01T00%3A00%3A00.000Z");

    vi.stubGlobal("fetch", vi.fn(async () => json(401, { status: false, message: "Invalid key" })));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(readLedger(null)).rejects.toMatchObject({ code: "paystack_key" });
  });
});
