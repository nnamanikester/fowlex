import { describe, expect, it } from "vitest";

import { formatPhone, isPopular, maskAccount, nameKey, normalisePhone, sortBanks, validateSupplier } from "./rules";

const good = {
  name: "Amo Byng",
  supplies: ["chicks"],
  contactName: "",
  phone: "0803 123 4567",
  email: "",
  address: "",
  notes: "",
  bank: null,
};

describe("supplier rules", () => {
  it("accepts a supplier, with or without a bank account", () => {
    expect(validateSupplier(good)).toEqual({});
    expect(
      validateSupplier({
        ...good,
        bank: { bankCode: "058", bankName: "GTBank", accountNumber: "0123456789", accountName: "X" },
      }),
    ).toEqual({});
    expect(validateSupplier({ ...good, phone: "", email: "sales@amobyng.com" })).toEqual({});
  });

  it.each([
    ["name", ""],
    ["name", "x".repeat(81)],
    ["supplies", ["gold"]],
    ["supplies", "feed"],
    ["phone", "12345"],
    ["phone", 803],
    ["email", "not-an-email"],
    ["email", 5],
    ["contactName", "x".repeat(121)],
    ["address", "x".repeat(301)],
    ["address", 1],
    ["notes", "x".repeat(501)],
    ["bank", { bankCode: "058", accountNumber: "123" }],
    ["bank", { bankCode: "", accountNumber: "0123456789" }],
    ["bank", "GTBank"],
  ])("refuses %s = %j", (field, value) => {
    expect(validateSupplier({ ...good, [field]: value })).toHaveProperty(field);
  });

  it("writes Nigerian phone numbers one way, and masks account numbers", () => {
    expect(normalisePhone("0803 123 4567")).toBe("+2348031234567");
    expect(normalisePhone("+234 (803) 123-4567")).toBe("+2348031234567");
    expect(normalisePhone("2349031234567")).toBe("+2349031234567");
    expect(normalisePhone("0603 123 4567")).toBeNull();
    expect(formatPhone("+2348031234567")).toBe("0803 123 4567");
    expect(formatPhone("12345")).toBe("12345");
    expect(maskAccount("0123456789")).toBe("••••6789");
    expect(nameKey("  Amo   BYNG ")).toBe("amo byng");
  });

  it("puts the banks suppliers use most first", () => {
    const banks = [{ name: "Zenith Bank" }, { name: "Abbey Mortgage" }, { name: "OPay" }, { name: "Moniepoint MFB" }];
    expect(sortBanks(banks).map((b) => b.name)).toEqual(["OPay", "Moniepoint MFB", "Zenith Bank", "Abbey Mortgage"]);
    expect(isPopular("Guaranty Trust Bank")).toBe(true);
    expect(isPopular("Abbey Mortgage")).toBe(false);
  });
});
