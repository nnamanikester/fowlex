import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

/** The byte-order mark every file starts with, so Excel reads ₦ correctly. */
const BOM = "\uFEFF";

describe("toCsv", () => {
  it("starts with a byte-order mark and quotes text", () => {
    expect(toCsv(["Customer", "Amount (₦)"], [["The Grill Lounge", 450000.5]])).toBe(
      BOM + '"Customer","Amount (₦)"\r\n"The Grill Lounge",450000.5\r\n',
    );
  });

  it("escapes quotes and keeps commas and new lines inside a field", () => {
    expect(toCsv(["Note"], [['Said "pay Friday", then left\nearly']])).toBe(
      BOM + '"Note"\r\n"Said ""pay Friday"", then left\nearly"\r\n',
    );
  });

  it("neutralises formulas in text but keeps negative numbers as numbers", () => {
    const csv = toCsv(
      ["Name", "Amount"],
      [
        ['=HYPERLINK("x")', -5000],
        ["+234 803", null],
        ["@SUM(A1)", 0],
      ],
    );
    expect(csv).toContain(`"'=HYPERLINK(""x"")",-5000`);
    expect(csv).toContain(`"'+234 803",`);
    expect(csv).toContain(`"'@SUM(A1)",0`);
  });
});
