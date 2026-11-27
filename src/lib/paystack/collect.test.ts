import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startTransferCharge, verifyCharge } from "./collect";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
beforeEach(() => vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const input = {
  email: "customer+inv-2026-0001@fowlex.com",
  amountKobo: 700_000,
  reference: "fwx-pay-inv-2026-0001-1",
  expiresAt: new Date("2026-11-27T12:00:00Z"),
  metadata: { invoiceNumber: "INV-2026-0001" },
};

describe("paying by transfer to an account of its own", () => {
  it("asks Paystack for an account, and fills in what it leaves out", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      json(200, { status: true, data: { account_number: "9900000001" } }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await startTransferCharge(input)).toEqual({
      reference: input.reference,
      accountNumber: "9900000001",
      accountName: "",
      bankName: "",
      expiresAt: input.expiresAt,
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("/charge");
    expect(JSON.parse(String(init!.body))).toMatchObject({
      email: input.email,
      amount: 700_000,
      bank_transfer: { account_expires_at: "2026-11-27T12:00:00.000Z" },
    });
    fetch.mockImplementationOnce(async () =>
      json(200, {
        status: true,
        data: {
          reference: "r",
          account_number: "1",
          account_name: "A",
          bank: { name: "Wema" },
          account_expires_at: "2026-11-27T13:00:00Z",
        },
      }),
    );
    expect(await startTransferCharge(input)).toMatchObject({ reference: "r", bankName: "Wema", accountName: "A" });
  });

  it("says plainly when Paystack refuses, and when the key or the service is the trouble", async () => {
    const fetch = vi.fn(async () => json(400, { status: false, message: "Transfer channel not enabled" }));
    vi.stubGlobal("fetch", fetch);
    await expect(startTransferCharge(input)).rejects.toMatchObject({ status: 400, code: "transfer_refused" });
    fetch.mockImplementationOnce(async () => json(401, { status: false, message: "Invalid key" }));
    await expect(startTransferCharge(input)).rejects.toMatchObject({ status: 503, code: "paystack_key" });
    fetch.mockImplementationOnce(async () => json(400, { status: false, message: "IP not whitelisted" }));
    await expect(startTransferCharge(input)).rejects.toMatchObject({ status: 503 });
    fetch.mockImplementationOnce(async () => json(200, { status: true, data: {} }));
    await expect(startTransferCharge(input)).rejects.toMatchObject({ status: 503 });
  });

  it("checks a payment: in, not yet, unknown, or can't tell", async () => {
    const fetch = vi.fn(async () =>
      json(200, { status: true, data: { status: "success", amount: 700_000, paid_at: "2026-11-27T11:00:00Z" } }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await verifyCharge("r")).toEqual({
      status: "success",
      amountKobo: 700_000,
      paidAt: new Date("2026-11-27T11:00:00Z"),
    });
    fetch.mockImplementationOnce(async () => json(200, { status: true, data: {} }));
    expect(await verifyCharge("r")).toEqual({ status: "", amountKobo: 0, paidAt: null });
    fetch.mockImplementationOnce(async () => json(404, { status: false, message: "Transaction reference not found" }));
    expect(await verifyCharge("r")).toBeNull();
    fetch.mockImplementationOnce(async () => json(500, { status: false, message: "Down" }));
    await expect(verifyCharge("r")).rejects.toMatchObject({ status: 503 });
  });
});
