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
