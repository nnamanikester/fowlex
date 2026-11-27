import { expect, test } from "@playwright/test";

import { signInAs, watchErrors } from "./helpers";
import { E2E_USERS } from "./users";

test("buy a ₦600,000 generator tracked as equipment: it costs ₦25,000 a month over 24 months", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const name = `Perkins generator ${info.project.name}`;
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Spend money" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Spend money" });
  await sheet.getByRole("radio", { name: "Other expense" }).click();
  await sheet.getByRole("radio", { name: "Equipment" }).click();
  await sheet.getByLabel("Amount").fill("600000");
  await sheet.getByLabel("For", { exact: true }).fill(name);
  await expect(sheet.getByRole("checkbox", { name: /Track as equipment/ })).toBeChecked();
  await sheet.getByLabel("What it is").selectOption("generator");
  await expect(sheet.getByLabel("Lasts (months)")).toHaveValue("24");
  await sheet.getByRole("radio", { name: /Already paid/ }).click();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/EXP-\d{4}-\d{4} recorded\./)).toBeVisible();

  await page.goto("/inventory");
  await page.getByRole("navigation", { name: "Inventory sections" }).getByRole("link", { name: "Equipment" }).click();
  const row = page.getByRole("main").getByRole("button", { name: new RegExp(name) });
  await expect(row).toContainText("₦25,000.00 a month");
  await expect(row).toContainText("over 2 years");

  // Sold: it stops costing the farm.
  await row.click();
  await page.getByRole("button", { name: "Sold or scrapped" }).click();
  const dispose = page.getByRole("dialog", { name: `${name}: sold or scrapped` });
  await dispose.getByLabel("Sold for").fill("450000");
  await dispose.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${name} marked sold.`)).toBeVisible();
  await expect(row).toContainText("Sold");
  expect(errors).toEqual([]);
});

test.describe("staff", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("see stock counts but no money, and no equipment", async ({ page }) => {
    await signInAs(page, E2E_USERS.staff.email);
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Inventory sections" })).toHaveCount(0);
    await expect(page.getByRole("main").getByText("₦")).toHaveCount(0);
    await page.goto("/inventory/equipment");
    await expect(page.getByRole("main").getByText("₦")).toHaveCount(0);
  });
});
