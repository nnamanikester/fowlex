import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateEmployee } from "./rules";
import {
  createEmployee,
  deleteEmployee,
  employeeRecipient,
  listEmployees,
  setEmployeeStatus,
  updateEmployee,
} from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { createBatch } from "@/lib/batches/service";
import { createHouse } from "@/lib/houses/service";
import * as banks from "@/lib/paystack/banks";
import { resetSimulator } from "@/lib/paystack/simulator";
import { UserModel } from "@/models/user";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "");
  vi.stubEnv("PAYSTACK_SIMULATE", "1");
  banks.clearBankCache();
  resetSimulator();
});
afterEach(() => vi.unstubAllEnvs());

const TODAY = "2026-11-27";
const actor = (): CurrentUser => ({
  id: String(oid()),
  farmId: String(oid()),
  name: "Ada",
  email: "a@f.com",
  role: "owner",
});
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );
const gtb = { bankCode: "058", accountNumber: "0123456781", accountName: "SOMEONE ELSE" };
const musa = {
  name: "  Musa   Bello ",
  job: "Farm hand",
  phone: "0803 123 4567",
  payType: "monthly",
  rateKobo: 6_000_000,
};

describe("people on the farm", () => {
  it("adds someone with a bank account the bank names, and lists them", async () => {
    const a = actor();
    const e = await createEmployee(a, { ...musa, email: " Musa@Farm.COM ", bank: gtb }, TODAY);
    expect(e).toMatchObject({
      name: "Musa Bello",
      phone: "+2348031234567",
      email: "musa@farm.com",
      startDate: TODAY,
      status: "active",
      hasLogin: false,
      bank: { bankName: "Guaranty Trust Bank", accountName: "CHIOMA EZE", payable: true },
    });
    await UserModel.create({ farmId: a.farmId, email: "musa@farm.com", name: "Musa", role: "staff" });
    expect(await listEmployees(a.farmId)).toMatchObject([{ id: e.id, hasLogin: true }]);
    expect(await listEmployees(String(oid()))).toEqual([]);
  });

  it("explains what's wrong with the form", async () => {
    const a = actor();
    expect(await refusal(createEmployee(a, { ...musa, name: " " }, TODAY))).toMatchObject({ field: "name" });
    expect(await refusal(createEmployee(a, { ...musa, phone: "123" }, TODAY))).toMatchObject({ field: "phone" });
    expect(await refusal(createEmployee(a, { ...musa, rateKobo: 0 }, TODAY))).toMatchObject({ field: "rateKobo" });
    expect(await refusal(createEmployee(a, { ...musa, payType: "weekly" }, TODAY))).toMatchObject({ field: "payType" });
    expect(await refusal(createEmployee(a, { ...musa, startDate: "2027-01-01" }, TODAY))).toMatchObject({
      field: "startDate",
    });
    expect(await refusal(createEmployee(a, { ...musa, email: "nope" }, TODAY))).toMatchObject({ field: "email" });
    expect(
      await refusal(createEmployee(a, { ...musa, bank: { bankCode: "058", accountNumber: "12" } }, TODAY)),
    ).toMatchObject({ field: "bank" });
    expect(
      await refusal(createEmployee(a, { ...musa, bank: { ...gtb, accountNumber: "0000000000" } }, TODAY)),
    ).toMatchObject({ field: "bank" });
    expect(
      await refusal(createEmployee(a, { ...musa, payType: "per-batch", batchIds: [String(oid())] }, TODAY)),
    ).toMatchObject({ field: "batchIds" });
    expect(validateEmployee({}, { today: TODAY })).toMatchObject({
      name: expect.any(String),
      job: expect.any(String),
      phone: expect.any(String),
      email: expect.any(String),
      address: expect.any(String),
      notes: expect.any(String),
      startDate: expect.any(String),
      batchIds: expect.any(String),
    });
    expect(validateEmployee({ ...musa, name: "x".repeat(121) }, { today: TODAY }).name).toMatch(/at most/);
  });

  it("keeps batches only for per-batch workers; saves edits from a fresh form", async () => {
    const a = actor();
    const house = await createHouse(a, { name: "House 1", capacity: 5000 });
    const { batch } = await createBatch(
      a,
      {
        houseId: house.id,
        placedOn: "2026-11-15",
        breed: "Ross 308",
        delivered: 1000,
        pricePerChickKobo: 0,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
      },
      {},
      TODAY,
    );
    const e = await createEmployee(a, { ...musa, batchIds: [batch.id] }, TODAY);
    expect(e.batchIds).toEqual([]);
    const edited = await updateEmployee(
      a,
      e.id,
      { ...musa, payType: "per-batch", rateKobo: 15_000_000, batchIds: [batch.id, batch.id], bank: gtb },
      0,
      TODAY,
    );
    expect(edited).toMatchObject({ payType: "per-batch", batchIds: [batch.id], bank: { payable: true } });
    expect(await refusal(updateEmployee(a, e.id, musa, 0, TODAY))).toMatchObject({ code: "stale" });
    // The same account isn't checked again.
    const resolve = vi.spyOn(banks, "resolveAccount");
    await updateEmployee(a, e.id, { ...musa, bank: gtb }, edited.version, TODAY);
    expect(resolve).not.toHaveBeenCalled();
    expect(await refusal(updateEmployee(a, String(oid()), musa, 0, TODAY))).toMatchObject({ status: 404 });
    expect(await refusal(updateEmployee(a, "nope", musa, 0, TODAY))).toMatchObject({ status: 404 });
  });

  it("marks someone as left and back; removes someone added by mistake", async () => {
    const a = actor();
    const e = await createEmployee(a, { ...musa, startDate: "2026-01-05" }, TODAY);
    expect(await setEmployeeStatus(a, e.id, { status: "left", leftOn: "2026-11-20" }, TODAY)).toMatchObject({
      status: "left",
      leftOn: "2026-11-20",
    });
    expect(await setEmployeeStatus(a, e.id, { status: "active" }, TODAY)).toMatchObject({
      status: "active",
      leftOn: null,
    });
    expect(await setEmployeeStatus(a, e.id, { status: "left" }, TODAY)).toMatchObject({ leftOn: TODAY });
    expect(await refusal(setEmployeeStatus(a, e.id, { status: "left", leftOn: "2025-01-01" }, TODAY))).toMatchObject({
      field: "leftOn",
    });
    expect(await refusal(setEmployeeStatus(a, e.id, { status: "gone" }, TODAY))).toMatchObject({ field: "status" });
    await deleteEmployee(a, e.id);
    expect(await listEmployees(a.farmId)).toEqual([]);
  });

  it("gives Paystack's recipient to pay them, making it if it couldn't be made before", async () => {
    const a = actor();
    vi.spyOn(banks, "createRecipient").mockRejectedValueOnce(new HttpError(503, "paystack_unavailable", "busy"));
    const e = await createEmployee(a, { ...musa, bank: gtb }, TODAY);
    expect(e.bank?.payable).toBe(false);
    expect((await employeeRecipient(a.farmId, e.id)).recipientCode).toMatch(/^RCP_/);
    expect((await listEmployees(a.farmId))[0].bank?.payable).toBe(true);
    const cash = await createEmployee(a, musa, TODAY);
    expect(await refusal(employeeRecipient(a.farmId, cash.id))).toMatchObject({ code: "no_bank" });
    expect(await refusal(employeeRecipient(a.farmId, String(oid())))).toMatchObject({ status: 404 });
  });
});
