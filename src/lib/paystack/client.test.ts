import { afterEach, describe, expect, it, vi } from "vitest";

import { isProviderTrouble, paystack, paystackMode } from "./client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("paystack client", () => {
  it("knows live, test, simulated and off", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_abc");
    expect(paystackMode()).toBe("live");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_abc");
    expect(paystackMode()).toBe("test");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_");
    vi.stubEnv("PAYSTACK_SIMULATE", "");
    expect(paystackMode()).toBe("off");
    vi.stubEnv("PAYSTACK_SIMULATE", "1");
    expect(paystackMode()).toBe("simulated");
  });

  it("sends the secret key, query and body, and returns any answer with its status", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret");
    const fetch = vi.fn(async () => json(422, { status: false, message: "Could not resolve account name" }));
    vi.stubGlobal("fetch", fetch);
    const res = await paystack("/bank/resolve", { query: { account_number: "0123456789", bank_code: "058" } });
    expect(res).toEqual({
      httpStatus: 422,
      status: false,
      message: "Could not resolve account name",
      data: null,
      meta: undefined,
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.paystack.co/bank/resolve?account_number=0123456789&bank_code=058");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_secret");

    fetch.mockImplementationOnce(async () =>
      json(200, { status: true, message: "ok", data: { a: 1 }, meta: { next: "x" } }),
    );
    expect(await paystack("/transfer", { method: "POST", body: { amount: 100 } })).toMatchObject({
      status: true,
      data: { a: 1 },
      meta: { next: "x" },
    });
    expect((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body).toBe('{"amount":100}');
    fetch.mockImplementationOnce(async () => new Response("<html>bad gateway</html>", { status: 502 }));
    expect(await paystack("/balance")).toMatchObject({ httpStatus: 502, status: false, message: "" });
  });

  it("is unavailable (503) when Paystack can't be reached, and off without a key", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    await expect(paystack("/balance")).rejects.toMatchObject({ status: 503, code: "paystack_unavailable" });
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    vi.stubEnv("PAYSTACK_SIMULATE", "");
    await expect(paystack("/balance")).rejects.toMatchObject({ status: 503, code: "paystack_off" });
  });

  it("tells Paystack's trouble from a verdict", () => {
    const res = (httpStatus: number, message = "") => ({ httpStatus, status: false, message, data: null });
    expect(isProviderTrouble(res(500))).toBe(true);
    expect(isProviderTrouble(res(429))).toBe(true);
    expect(isProviderTrouble(res(400, "Daily limit reached"))).toBe(true);
    expect(isProviderTrouble(res(422, "Could not resolve account name"))).toBe(false);
  });
});
