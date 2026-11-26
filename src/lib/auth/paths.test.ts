import { describe, expect, it } from "vitest";

import { safeRedirect } from "./paths";

describe("safeRedirect", () => {
  it("keeps paths on this site", () => {
    expect(safeRedirect("/invoices?status=overdue")).toBe("/invoices?status=overdue");
  });
  it.each([null, "", "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/auth/login"])(
    "sends %j home",
    (target) => {
      expect(safeRedirect(target)).toBe("/");
    },
  );
});
