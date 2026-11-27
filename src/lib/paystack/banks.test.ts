import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classifyLookup, clearBankCache, createRecipient, listBanks, resolveAccount } from "./banks";
import { resetSimulator } from "./simulator";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  clearBankCache();
  resetSimulator();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("banks against Paystack", () => {
  beforeEach(() => vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret"));

  it("follows the cursor, drops inactive and repeated banks, sorts them and caches for a day", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes("next=")
        ? json(200, {
            status: true,
            data: [
              { code: "057", name: "Zenith Bank" },
              { code: "058", name: "GTBank" },
            ],
            meta: {},
          })
        : json(200, {
            status: true,
            data: [
              { code: "058", name: "GTBank" },
              { code: "999", name: "Closed Bank", active: false },
              { code: "044", name: "Access Bank" },
            ],
            meta: { next: "page2" },
          }),
    );
    vi.stubGlobal("fetch", fetch);
    // With test keys, Paystack's test bank comes first: it checks accounts without the daily limit.
    expect((await listBanks()).map((b) => b.name)).toEqual([
      "Test Bank (test mode only)",
      "Access Bank",
      "GTBank",
      "Zenith Bank",
    ]);
    expect((await listBanks())[0]).toEqual({ code: "001", name: "Test Bank (test mode only)", test: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    // Live, it's never offered, even if Paystack's list had it.
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_secret");
    expect((await listBanks()).map((b) => b.code)).not.toContain("001");
  });

  it("is unavailable when the bank list can't be had", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(500, { status: false })),
    );
    await expect(listBanks()).rejects.toMatchObject({ status: 503 });
  });

  it("names an account, remembers it, and never remembers Paystack's trouble", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes("/bank/resolve")
        ? json(200, { status: true, data: { account_name: " CHIOMA EZE " } })
        : json(200, { status: true, data: [{ code: "058", name: "GTBank" }] }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await resolveAccount("012-345-6789", "058")).toEqual({
      accountNumber: "0123456789",
      bankCode: "058",
      bankName: "GTBank",
      accountName: "CHIOMA EZE",
    });
    await resolveAccount("0123456789", "058");
    expect(fetch.mock.calls.filter(([u]) => String(u).includes("/bank/resolve"))).toHaveLength(1);

    fetch.mockImplementation(async () => json(503, { status: false, message: "Service unavailable" }));
    await expect(resolveAccount("0123456780", "058")).rejects.toMatchObject({ status: 503 });
    await expect(resolveAccount("0123456780", "058")).rejects.toMatchObject({ status: 503 });
    expect(fetch.mock.calls.filter(([u]) => String(u).includes("0123456780"))).toHaveLength(2);
  });

  it("refuses a short number or no bank before asking", async () => {
    await expect(resolveAccount("12345", "058")).rejects.toMatchObject({ status: 400, field: "accountNumber" });
    await expect(resolveAccount(12345, "058")).rejects.toMatchObject({ status: 400, field: "accountNumber" });
    await expect(resolveAccount("0123456789", "")).rejects.toMatchObject({ status: 400, field: "bankCode" });
    await expect(resolveAccount("0123456789", 58)).rejects.toMatchObject({ status: 400, field: "bankCode" });
  });

  it("classifies lookups: found, no such account, wrong bank, or no verdict", () => {
    const res = (httpStatus: number, status: boolean, message = "", data: unknown = null) =>
      ({ httpStatus, status, message, data }) as Parameters<typeof classifyLookup>[0];
    expect(classifyLookup(res(200, true, "", { account_name: "A" }))).toEqual({ kind: "found", accountName: "A" });
    expect(classifyLookup(res(422, false, "Could not resolve account name"))).toEqual({ kind: "not_found" });
    expect(classifyLookup(res(422, false, "Unknown bank code"))).toEqual({ kind: "invalid_bank" });
    expect(classifyLookup(res(200, false, "Account not found"))).toEqual({ kind: "not_found" });
    expect(classifyLookup(res(400, false, "Test mode daily limit"))).toBeNull();
    expect(classifyLookup(res(401, false, "Invalid key"))).toBeNull();
    expect(classifyLookup(res(500, false))).toBeNull();
  });

  it("makes a transfer recipient, or says why not", async () => {
    const account = { accountName: "CHIOMA EZE", accountNumber: "0123456789", bankCode: "058" };
    const fetch = vi.fn(async () => json(201, { status: true, data: { recipient_code: "RCP_1" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await createRecipient(account)).toBe("RCP_1");
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({
      type: "nuban",
      currency: "NGN",
      account_number: "0123456789",
    });
    fetch.mockImplementationOnce(async () => json(400, { status: false, message: "Account details invalid" }));
    await expect(createRecipient(account)).rejects.toMatchObject({ status: 400, code: "recipient_refused" });
    fetch.mockImplementationOnce(async () => json(400, { status: false }));
    await expect(createRecipient(account)).rejects.toMatchObject({ message: "Paystack won't pay this account." });
    fetch.mockImplementationOnce(async () => json(500, { status: false }));
    await expect(createRecipient(account)).rejects.toMatchObject({ status: 503 });
  });
});

describe("banks in the simulator", () => {
  beforeEach(() => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    vi.stubEnv("PAYSTACK_SIMULATE", "1");
  });

  it("lists banks and names accounts, with the special numbers misbehaving", async () => {
    expect((await listBanks()).length).toBeGreaterThan(10);
    expect((await resolveAccount("0123456781", "058")).accountName).toBe("CHIOMA EZE");
    expect(await resolveAccount("0000000000", "001")).toMatchObject({
      accountName: "TEST ACCOUNT",
      bankName: "Test Bank (test mode only)",
    });
    await expect(resolveAccount("0000000000", "058")).rejects.toMatchObject({ status: 400, code: "account_not_found" });
    await expect(resolveAccount("0123456781", "000")).rejects.toMatchObject({ status: 400, code: "invalid_bank" });
    await expect(resolveAccount("1111111111", "058")).rejects.toMatchObject({ status: 503 });
  });
});
