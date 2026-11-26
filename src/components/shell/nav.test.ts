import { describe, expect, it } from "vitest";

import { ALL_ITEMS, NAV, navFor, pageFor } from "./nav";

const labels = (role: Parameters<typeof navFor>[0]) => navFor(role).flatMap((g) => g.items.map((i) => i.label));

describe("nav", () => {
  it("has the pages from the plan, each with its own shortcut and path", () => {
    expect(ALL_ITEMS.map((i) => i.label)).toEqual([
      "Overview",
      "Batches",
      "Daily log",
      "Inventory",
      "Suppliers",
      "Customers",
      "Contracts",
      "Sales",
      "Invoices",
      "Expenses",
      "Reports",
      "Forecasts",
      "People",
      "Payroll",
      "Settings",
    ]);
    expect(new Set(ALL_ITEMS.map((i) => i.key)).size).toBe(ALL_ITEMS.length);
    expect(new Set(ALL_ITEMS.map((i) => i.href)).size).toBe(ALL_ITEMS.length);
  });

  it("shows owners everything", () => {
    expect(labels("owner")).toHaveLength(ALL_ITEMS.length);
    expect(navFor("owner")).toHaveLength(NAV.length);
  });

  it("shows managers everything but Settings", () => {
    expect(labels("manager")).toEqual(ALL_ITEMS.map((i) => i.label).filter((l) => l !== "Settings"));
  });

  it("shows staff the farm and no money", () => {
    expect(labels("staff")).toEqual(["Batches", "Daily log", "Inventory"]);
    expect(navFor("staff").map((g) => g.title)).toEqual(["Farm"]);
  });

  it("shows customers nothing: they use the portal", () => {
    expect(navFor("customer")).toEqual([]);
  });

  it("names the page for the breadcrumb", () => {
    expect(pageFor("/")).toEqual({ item: expect.objectContaining({ label: "Overview" }), child: undefined });
    expect(pageFor("/batches").item?.label).toBe("Batches");
    expect(pageFor("/batches/new")).toEqual({ item: expect.objectContaining({ label: "Batches" }), child: "New" });
    expect(pageFor("/invoices/abc")).toEqual({
      item: expect.objectContaining({ label: "Invoices" }),
      child: "Details",
    });
  });
});
