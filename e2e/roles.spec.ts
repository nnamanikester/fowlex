import { expect, test } from "@playwright/test";

import { signInAs, watchErrors } from "./helpers";
import { E2E_USERS } from "./users";

const NO_ACCESS = "Your role can't open this page";

test.describe("signed in as someone else", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("staff land on the daily log, see only the farm, and can't open money pages or APIs", async ({ page }) => {
    const errors = watchErrors(page);
    await signInAs(page, E2E_USERS.staff.email);
    await expect(page).toHaveURL("/log");

    if (!test.info().project.use.isMobile) {
      const sidebar = page.getByRole("complementary", { name: "Sidebar" });
      // Each link also holds its hidden shortcut hint ("G B"), so match the start.
      await expect(sidebar.getByRole("navigation", { name: "Pages" }).getByRole("link")).toHaveText([
        /^Batches/,
        /^Daily log/,
        /^Inventory/,
      ]);
    }

    await page.goto("/reports");
    await expect(page.getByText(NO_ACCESS)).toBeVisible();
    await page.goto("/");
    await expect(page).toHaveURL("/log");

    const api = await page.request.get("/api/reports/summary");
    expect(api.status()).toBe(403);
    expect((await api.json()).error.code).toBe("forbidden");
    expect(errors).toEqual([]);
  });

  test("managers see everything but Settings", async ({ page }) => {
    await signInAs(page, E2E_USERS.manager.email);
    await expect(page).toHaveURL("/");
    await page.goto("/settings");
    await expect(page.getByText(NO_ACCESS)).toBeVisible();
    await page.goto("/payroll");
    await expect(page.getByRole("heading", { level: 1, name: "Payroll" })).toBeVisible();
    expect((await page.request.get("/api/reports/summary")).status()).toBe(200);
  });

  test("finance keeps the books and sees everything about money, but changes nothing else", async ({ page }) => {
    const errors = watchErrors(page, [/status of 403/]);
    await signInAs(page, E2E_USERS.finance.email);
    await expect(page).toHaveURL("/");

    if (!test.info().project.use.isMobile) {
      const pages = page.getByRole("complementary", { name: "Sidebar" }).getByRole("navigation", { name: "Pages" });
      for (const name of [/^Overview/, /^Batches/, /^Suppliers/, /^Invoices/, /^Expenses/, /^Reports/, /^Payroll/])
        await expect(pages.getByRole("link", { name })).toBeVisible();
      await expect(pages.getByRole("link", { name: /^Daily log/ })).toHaveCount(0);
      await expect(pages.getByRole("link", { name: /^Settings/ })).toHaveCount(0);
    }

    // Spending is theirs to record.
    await page.goto("/expenses");
    await expect(page.getByRole("main").getByRole("button", { name: "Spend money" }).first()).toBeVisible();
    // Suppliers and pay are there to see, not to change.
    await page.goto("/suppliers");
    await expect(page.getByRole("heading", { level: 1, name: "Suppliers" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add supplier" })).toHaveCount(0);
    await page.goto("/payroll");
    await expect(page.getByRole("heading", { level: 1, name: "Payroll" })).toBeVisible();

    expect((await page.request.get("/api/reports/summary")).status()).toBe(200);
    expect((await page.request.patch("/api/settings", { data: {} })).status()).toBe(403);
    expect((await page.request.post("/api/suppliers", { data: { name: "Not mine" } })).status()).toBe(403);
    expect((await page.request.post("/api/payroll", { data: { period: "2001-01" } })).status()).toBe(403);
    expect((await page.request.post("/api/batches", { data: {} })).status()).toBe(403);
    expect(errors).toEqual([]);
  });

  test("sales land on Sales and see the birds and stock to sell, but no money", async ({ page }) => {
    const errors = watchErrors(page, [/status of 403/]);
    await signInAs(page, E2E_USERS.sales.email);
    await expect(page).toHaveURL("/sales");

    if (!test.info().project.use.isMobile) {
      const sidebar = page.getByRole("complementary", { name: "Sidebar" });
      await expect(sidebar.getByRole("navigation", { name: "Pages" }).getByRole("link")).toHaveText([
        /^Batches/,
        /^Inventory/,
        /^Customers/,
        /^Contracts/,
        /^Sales/,
        /^Invoices/,
      ]);
    }

    await page.goto("/batches");
    await expect(page.getByRole("heading", { level: 1, name: "Batches" })).toBeVisible();
    await page.goto("/expenses");
    await expect(page.getByText(NO_ACCESS)).toBeVisible();
    await page.goto("/");
    await expect(page).toHaveURL("/sales");

    expect((await page.request.get("/api/reports/summary")).status()).toBe(403);
    expect((await page.request.get("/api/expenses")).status()).toBe(403);
    expect((await page.request.post("/api/inventory/items", { data: {} })).status()).toBe(403);
    expect(errors).toEqual([]);
  });

  test("customers only reach their portal", async ({ page }) => {
    await signInAs(page, E2E_USERS.customer.email);
    await expect(page).toHaveURL("/portal");
    await expect(page.getByRole("heading", { name: `Welcome, ${E2E_USERS.customer.name}` })).toBeVisible();

    await page.goto("/batches");
    await expect(page).toHaveURL("/portal");
    expect((await page.request.get("/api/reports/summary")).status()).toBe(403);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/auth/login?reason=signed_out");
  });
});

test("owners can open everything, but not the customer portal", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  expect((await page.request.get("/api/reports/summary")).status()).toBe(200);
  await page.goto("/portal");
  await expect(page).toHaveURL("/");
});
