import { describe, expect, it } from "vitest";

import { formatInvoiceNumber, validateSettings } from "./rules";
import { getSettings, nextInvoiceNumber, readSettings, updateSettings } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { runAs } from "@/lib/audit/context";
import { AuditLogModel } from "@/models/audit-log";
import { SettingsModel } from "@/models/settings";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const actor = (): CurrentUser => ({
  id: String(oid()),
  farmId: String(oid()),
  name: "Ada",
  email: "a@f.com",
  role: "owner",
});
const NOV = new Date("2026-11-26T12:00:00Z");

describe("settings", () => {
  it("starts with the defaults, once per farm", async () => {
    const { farmId } = actor();
    const settings = await readSettings(farmId);
    expect(settings).toMatchObject({
      businessName: "Fowlex Farms",
      invoicePrefix: "INV",
      nextInvoiceNumber: 1,
      paymentTermsDays: 14,
      vatEnabled: false,
      vatRateBps: 750,
      expenseApprovalLimitKobo: 10_000_000,
      defaultPricePerKgKobo: null,
      overheadMethod: "bird-days",
      stockingDensity: 10,
      houseRestDays: 14,
    });
    await Promise.all([getSettings(farmId), getSettings(farmId), getSettings(farmId)]);
    expect(await SettingsModel.countDocuments({ farmId })).toBe(1);
  });

  it("changing the invoice prefix changes the number on the next invoice", async () => {
    const a = actor();
    expect(await nextInvoiceNumber(a.farmId, { now: NOV })).toBe("INV-2026-0001");
    await updateSettings(a, { ...(await readSettings(a.farmId)), invoicePrefix: "fwx" });
    expect(await nextInvoiceNumber(a.farmId, { now: NOV })).toBe("FWX-2026-0002");
  });

  it("never gives two invoices the same number, even at the same moment", async () => {
    const { farmId } = actor();
    const numbers = await Promise.all(Array.from({ length: 25 }, () => nextInvoiceNumber(farmId, { now: NOV })));
    expect(new Set(numbers).size).toBe(25);
    expect(numbers.map((n) => Number(n.slice(-4))).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
  });

  it("audits an owner changing the next number, but not each invoice taking one", async () => {
    const a = actor();
    await nextInvoiceNumber(a.farmId, { now: NOV });
    await nextInvoiceNumber(a.farmId, { now: NOV });
    expect(await AuditLogModel.countDocuments({ action: "update" })).toBe(0);
    await runAs({ id: a.id, name: "Ada" }, async () =>
      updateSettings(a, { ...(await readSettings(a.farmId)), nextInvoiceNumber: 50 }),
    );
    const [row] = await AuditLogModel.find({ action: "update" }).lean();
    expect(row.changes).toEqual([{ field: "nextInvoiceNumber", before: 3, after: 50 }]);
  });

  it("refuses bad values, naming the field", async () => {
    const a = actor();
    const good = await readSettings(a.farmId);
    const error = await updateSettings(a, { ...good, accountNumber: "12345" }).catch((e: HttpError) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 400, field: "accountNumber" });
    expect((await readSettings(a.farmId)).accountNumber).toBe("");
  });
});

describe("validateSettings", () => {
  const base = {
    businessName: "Fowlex Farms",
    address: "",
    phone: "",
    email: "",
    invoicePrefix: "INV",
    nextInvoiceNumber: 1,
    paymentTermsDays: 14,
    vatEnabled: false,
    vatRateBps: 750,
    bankName: "",
    accountNumber: "",
    accountName: "",
    expenseApprovalLimitKobo: 10_000_000,
    defaultPricePerKgKobo: null,
    stockingDensity: 10,
    houseRestDays: 14,
  };
  it("accepts the defaults", () => expect(validateSettings(base)).toEqual({}));
  it.each([
    ["invoicePrefix", "INVOICE"],
    ["invoicePrefix", "in v"],
    ["nextInvoiceNumber", 0],
    ["nextInvoiceNumber", 1.5],
    ["paymentTermsDays", 400],
    ["vatRateBps", -1],
    ["accountNumber", "01234abcde"],
    ["email", "not-an-email"],
    ["businessName", " "],
    ["expenseApprovalLimitKobo", 10.5],
    ["defaultPricePerKgKobo", -100],
    ["stockingDensity", 0],
    ["stockingDensity", 41],
    ["stockingDensity", 10.25],
    ["houseRestDays", -1],
    ["houseRestDays", 3.5],
  ])("refuses %s = %j", (field, value) => {
    expect(validateSettings({ ...base, [field]: value })).toHaveProperty(field);
  });
  it("formats invoice numbers", () => expect(formatInvoiceNumber("INV", 2026, 7)).toBe("INV-2026-0007"));
});
