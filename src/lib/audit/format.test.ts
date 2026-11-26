import { describe, expect, it } from "vitest";

import { describeChange, fieldName, fieldValue } from "./format";

describe("audit formatting", () => {
  it("names fields as people say them", () => {
    expect(fieldName("amountKobo")).toBe("Amount");
    expect(fieldName("passwordHash")).toBe("Password");
    expect(fieldName("customerId")).toBe("Customer");
    expect(fieldName("expiresAt")).toBe("Expires at");
  });

  it("shows money in naira, nothing as a dash", () => {
    expect(fieldValue("amountKobo", 1_500_000)).toBe("₦15,000.00");
    expect(fieldValue("note", null)).toBe("–");
    expect(fieldValue("vatEnabled", true)).toBe("Yes");
    expect(fieldValue("expiresAt", "2026-12-03T10:00:00.000Z")).toBe("3 Dec 2026");
    expect(describeChange({ field: "amountKobo", before: 1_500_000, after: 1_800_000 })).toBe(
      "Amount: ₦15,000.00 → ₦18,000.00",
    );
  });

  it("shows other values as they are", () => {
    expect(fieldValue("tags", ["a", "b"])).toBe('["a","b"]');
    expect(fieldValue("count", 12)).toBe("12");
    expect(fieldValue("note", "")).toBe("–");
  });
});
