import { describe, expect, it } from "vitest";

import { can, homeFor, PERMISSIONS, ROLES } from "./permissions";

/**
 * Every role against every permission, written out: a change to the table has to change this too,
 * so nobody gains or loses a power by accident.
 */
const O = "owner";
const M = "manager";
const S = "staff";
const EXPECTED: Record<(typeof PERMISSIONS)[number], string[]> = {
  "batch.read": [O, M, S],
  "batch.write": [O, M],
  "log.write": [O, M, S],
  "inventory.read": [O, M, S],
  "inventory.write": [O, M],
  "supplier.read": [O, M],
  "supplier.write": [O, M],
  "customer.read": [O, M],
  "contract.read": [O, M],
  "sales.read": [O, M],
  "invoice.read": [O, M],
  "expense.read": [O, M],
  "expense.write": [O, M],
  "expense.approve": [O],
  "finance.read": [O, M],
  "people.read": [O, M],
  "payroll.read": [O, M],
  "payroll.run": [O],
  "payout.send": [O],
  "settings.manage": [O],
};

describe("permissions", () => {
  it("lists every permission in the expectations", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...PERMISSIONS].sort());
  });

  for (const permission of PERMISSIONS)
    for (const role of ROLES)
      it(`${role} ${EXPECTED[permission].includes(role) ? "can" : "can't"} ${permission}`, () => {
        expect(can(role, permission)).toBe(EXPECTED[permission].includes(role));
      });

  it("gives customers nothing in the dashboard", () => {
    expect(PERMISSIONS.filter((p) => can("customer", p))).toEqual([]);
  });

  it("sends each role to its own home page", () => {
    expect(ROLES.map(homeFor)).toEqual(["/", "/", "/log", "/portal"]);
  });
});
