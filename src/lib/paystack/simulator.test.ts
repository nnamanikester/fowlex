import { beforeEach, describe, expect, it } from "vitest";

import { resetSimulator, simulate } from "./simulator";

const call = (method: string, path: string, body: unknown = {}, query: Record<string, string> = {}) =>
  simulate<Record<string, unknown>>(method, path, query, body);

beforeEach(() => resetSimulator({ balance: 10_000_000 }));

describe("paystack simulator", () => {
  it("pays a recipient, takes the amount and fee off the balance, and settles at once", () => {
    const { data } = call("POST", "/transferrecipient", { bank_code: "058", account_number: "0123456789" });
    const recipient = String(data!.recipient_code);
    expect(call("POST", "/transfer", { amount: 3_000_000, recipient, reference: "PAY-1" })).toMatchObject({
      status: true,
      data: { status: "pending", fee: 2_500 },
    });
    expect(call("GET", "/transfer/verify/PAY-1").data).toMatchObject({ status: "success" });
    expect(call("GET", "/balance").data).toEqual([{ currency: "NGN", balance: 6_997_500 }]);
    expect(call("POST", "/transfer", { amount: 100, recipient, reference: "PAY-1" })).toMatchObject({
      httpStatus: 400,
      message: "Transfer reference already exists",
    });
  });

  it("fails a transfer to an account ending 0002 and refunds it; refuses too little balance or no recipient", () => {
    const recipient = String(
      call("POST", "/transferrecipient", { bank_code: "058", account_number: "0123450002" }).data!.recipient_code,
    );
    call("POST", "/transfer", { amount: 600_000, recipient, reference: "PAY-2" });
    expect(call("GET", "/transfer/verify/PAY-2").data).toMatchObject({ status: "failed", fee: 2_500 });
    expect(call("GET", "/balance").data).toEqual([{ currency: "NGN", balance: 10_000_000 }]);
    expect(call("POST", "/transfer", { amount: 20_000_000, recipient, reference: "PAY-3" }).message).toMatch(/balance/);
    expect(call("POST", "/transfer", { amount: 100, recipient: "RCP_nobody", reference: "PAY-4" }).message).toMatch(
      /Recipient/,
    );
    expect(call("POST", "/transfer", { amount: 100, recipient, reference: "PAY-5" }).data).toMatchObject({
      fee: 1_000,
    });
    expect(call("POST", "/transfer", { amount: 6_000_000, recipient, reference: "PAY-6" }).data).toMatchObject({
      fee: 5_000,
    });
  });

  it("waits for an OTP when asked, and only takes the right one", () => {
    resetSimulator({ otp: true });
    const recipient = String(
      call("POST", "/transferrecipient", { bank_code: "058", account_number: "0123456789" }).data!.recipient_code,
    );
    const sent = call("POST", "/transfer", { amount: 100_000, recipient, reference: "PAY-7" });
    expect(sent).toMatchObject({ message: "Transfer requires OTP to continue", data: { status: "otp" } });
    const code = String(sent.data!.transfer_code);
    expect(call("POST", "/transfer/finalize_transfer", { transfer_code: code, otp: "000000" }).message).toBe(
      "Invalid OTP",
    );
    expect(call("POST", "/transfer/finalize_transfer", { transfer_code: code, otp: "123456" }).status).toBe(true);
    expect(call("POST", "/transfer/finalize_transfer", { transfer_code: code, otp: "123456" }).status).toBe(false);
    expect(call("GET", "/transfer/verify/PAY-7").data).toMatchObject({ status: "success" });
  });

  it("doesn't know other calls or references", () => {
    expect(call("GET", "/transfer/verify/nope").httpStatus).toBe(404);
    expect(call("DELETE", "/customer").httpStatus).toBe(404);
    expect(call("GET", "/bank/resolve", {}, { bank_code: "058", account_number: "12" }).httpStatus).toBe(422);
  });
});
