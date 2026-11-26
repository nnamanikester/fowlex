import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSupplier,
  deleteSupplier,
  getSupplier,
  listSuppliers,
  payableRecipient,
  updateSupplier,
} from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import * as banks from "@/lib/paystack/banks";
import { HttpError } from "@/lib/auth/guard";
import { resetSimulator } from "@/lib/paystack/simulator";
import { SupplierModel } from "@/models/supplier";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "");
  vi.stubEnv("PAYSTACK_SIMULATE", "1");
  banks.clearBankCache();
  resetSimulator();
});
afterEach(() => vi.unstubAllEnvs());

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
// The form's name is ignored: the bank's is kept.
const gtb = { bankCode: "058", bankName: "", accountNumber: "0123456781", accountName: "SOMEONE ELSE" };

describe("suppliers", () => {
  it("adds a supplier with a bank account the bank has named, ready to pay", async () => {
    const a = actor();
    const supplier = await createSupplier(a, {
      name: " Amo   Byng ",
      supplies: ["chicks", "chicks", "feed"],
      phone: "0803 123 4567",
      email: " Sales@AmoByng.com ",
      bank: gtb,
    });
    expect(supplier).toMatchObject({
      name: "Amo Byng",
      supplies: ["chicks", "feed"],
      phone: "+2348031234567",
      email: "sales@amobyng.com",
      bank: { bankName: "Guaranty Trust Bank", accountName: "CHIOMA EZE", accountNumber: "0123456781", payable: true },
    });
    expect((await listSuppliers(a.farmId)).map((s) => s.name)).toEqual(["Amo Byng"]);
    expect(await getSupplier(a.farmId, supplier.id)).toMatchObject({ name: "Amo Byng" });
    expect(await getSupplier(a.farmId, "nope")).toBeNull();
    expect(await payableRecipient(a.farmId, supplier.id)).toMatchObject({ recipientCode: "RCP_sim0580123456781" });
  });

  it("refuses an account the bank can't find, and asks to retry when Paystack is down", async () => {
    const a = actor();
    expect(
      await refusal(createSupplier(a, { name: "X", bank: { ...gtb, accountNumber: "0000000000" } })),
    ).toMatchObject({
      status: 400,
      code: "account_not_found",
      field: "bank",
    });
    expect(
      await refusal(createSupplier(a, { name: "X", bank: { ...gtb, accountNumber: "1111111111" } })),
    ).toMatchObject({
      status: 503,
      field: "bank",
    });
    expect(await listSuppliers(a.farmId)).toEqual([]);
  });

  it("keeps an account Paystack couldn't make a recipient for, and makes it when first paid", async () => {
    const a = actor();
    const create = vi
      .spyOn(banks, "createRecipient")
      .mockRejectedValueOnce(new HttpError(503, "paystack_unavailable", "busy"))
      .mockRejectedValueOnce(new HttpError(400, "recipient_refused", "No"));
    const supplier = await createSupplier(a, { name: "Feed mill", bank: gtb });
    expect(supplier.bank).toMatchObject({ payable: false });
    expect(await refusal(createSupplier(a, { name: "Other", bank: gtb }))).toMatchObject({ field: "bank" });
    create.mockRestore();
    expect((await payableRecipient(a.farmId, supplier.id)).recipientCode).toMatch(/^RCP_/);
    expect((await getSupplier(a.farmId, supplier.id))?.bank?.payable).toBe(true);
  });

  it("refuses to pay a supplier without a bank account, or one that's gone", async () => {
    const a = actor();
    const supplier = await createSupplier(a, { name: "Cash seller" });
    expect(await refusal(payableRecipient(a.farmId, supplier.id))).toMatchObject({ status: 409, code: "no_bank" });
    expect(await refusal(payableRecipient(a.farmId, String(oid())))).toMatchObject({ status: 404 });
  });

  it("edits without asking the bank again for the same account, archives, refuses stale forms and clashes", async () => {
    const a = actor();
    const supplier = await createSupplier(a, { name: "Amo Byng", bank: gtb });
    await createSupplier(a, { name: "Feed mill" });
    const resolve = vi.spyOn(banks, "resolveAccount");
    const saved = await updateSupplier(a, supplier.id, { name: "Amo Byng", bank: gtb, archived: true }, 0);
    expect(resolve).not.toHaveBeenCalled();
    expect(saved).toMatchObject({ archived: true, bank: { accountName: "CHIOMA EZE" } });
    const moved = await updateSupplier(
      a,
      supplier.id,
      { name: "Amo Byng", bank: { ...gtb, accountNumber: "0123456784" } },
      1,
    );
    expect(moved.bank?.accountName).toBe("TUNDE BAKARE");
    expect((await updateSupplier(a, supplier.id, { name: "Amo Byng", bank: null }, 2)).bank).toBeNull();
    expect(await refusal(updateSupplier(a, supplier.id, { name: "Amo Byng" }, 0))).toMatchObject({ code: "stale" });
    expect(await refusal(updateSupplier(a, supplier.id, { name: "feed MILL" }, 3))).toMatchObject({
      code: "duplicate_name",
    });
    expect(await refusal(createSupplier(a, { name: "Feed Mill" }))).toMatchObject({ code: "duplicate_name" });
    expect(await refusal(createSupplier(a, { name: "" }))).toMatchObject({ field: "name" });
    await deleteSupplier(a, supplier.id);
    expect(await refusal(deleteSupplier(a, supplier.id))).toMatchObject({ status: 404 });
  });

  it("refuses saves that lose a race, or clash at the last moment", async () => {
    const a = actor();
    const supplier = await createSupplier(a, { name: "Amo Byng" });
    const lost = Object.assign(new Error("No matching document"), { name: "VersionError" });
    const save = vi.spyOn(SupplierModel.prototype, "save").mockRejectedValueOnce(lost);
    expect(await refusal(updateSupplier(a, supplier.id, { name: "Amo Byng" }, 0))).toMatchObject({ code: "stale" });
    save.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }));
    expect(await refusal(updateSupplier(a, supplier.id, { name: "Amo Byng" }, 0))).toMatchObject({
      code: "duplicate_name",
    });
    save.mockRejectedValueOnce(new Error("disk full"));
    await expect(updateSupplier(a, supplier.id, { name: "Amo Byng" }, 0)).rejects.toThrow("disk full");
    const create = vi.spyOn(SupplierModel, "create");
    create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }) as never);
    expect(await refusal(createSupplier(a, { name: "Twin" }))).toMatchObject({ code: "duplicate_name" });
    create.mockRejectedValueOnce(new Error("disk full") as never);
    await expect(createSupplier(a, { name: "Twin" })).rejects.toThrow("disk full");
  });
});
