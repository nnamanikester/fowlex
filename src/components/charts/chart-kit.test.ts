import { describe, expect, it } from "vitest";

import { formatValue } from "./chart-kit";

describe("formatValue", () => {
  it("shows kobo as naira, compact on axes", () => {
    expect(formatValue(366_000_000, "kobo")).toBe("₦3,660,000.00");
    expect(formatValue(450_000_000, "kobo", true)).toBe("₦4.5M");
  });

  it("never rounds small counts into a different number", () => {
    expect(formatValue(0.65, "count", true)).toBe("0.65");
    expect(formatValue(1.95, "count", true)).toBe("1.95");
    expect(formatValue(12_500, "count", true)).toBe("12.5K");
    expect(formatValue(1190, "count")).toBe("1,190");
  });
});
