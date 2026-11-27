import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("add a house with a suggested capacity, refuse a duplicate name, edit and delete it", async ({ page }) => {
  // The duplicate name is refused on purpose (409).
  const errors = watchErrors(page, [/status of 409/]);
  const name = `Test house ${test.info().project.name}`;
  const isMobile = test.info().project.use.isMobile;

  await page.goto("/settings/houses");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  // Phones get the floating button; desktops the header button.
  await page
    .getByRole("button", { name: isMobile ? "Add house" : "Add house", exact: true })
    .first()
    .click();

  const sheet = page.getByRole("dialog", { name: "Add a house" });
  await sheet.getByLabel("Name").fill(name);
  await sheet.getByLabel("Floor area (m²)").fill("120");
  await sheet.getByRole("button", { name: /holds about 1,200/ }).click();
  await expect(sheet.getByLabel("Holds (birds)")).toHaveValue("1200");
  await sheet.getByRole("button", { name: "Add house" }).click();
  await expect(page.getByText(`${name} added.`)).toBeVisible();

  const card = page.getByRole("button", { name: new RegExp(`^${name}, 1,200 birds`) });
  await expect(card).toBeVisible();
  await expect(card).toContainText("120 m² · 10.0 birds/m² · Deep litter · Open-sided");

  // The same name, in different case and spacing, is refused under the name field.
  await page.getByRole("button", { name: "Add house", exact: true }).first().click();
  await sheet.getByLabel("Name").fill(`  ${name.toUpperCase()} `);
  await sheet.getByLabel("Holds (birds)").fill("50");
  await sheet.getByRole("button", { name: "Add house" }).click();
  await expect(sheet.getByText(/There's already a house called/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Edit: put it under maintenance with a new capacity.
  await card.click();
  const edit = page.getByRole("dialog", { name });
  await edit.getByLabel("Holds (birds)").fill("1000");
  await edit.getByLabel("Status").selectOption("maintenance");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`${name} saved.`)).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(`^${name}, 1,000 birds, Under maintenance`) }),
  ).toBeVisible();

  // Delete, after confirming.
  await page.getByRole("button", { name: new RegExp(`^${name}, 1,000 birds`) }).click();
  await page.getByRole("dialog", { name }).getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: `Delete ${name}?` })
    .getByRole("button", { name: "Delete house" })
    .click();
  await expect(page.getByText(`${name} deleted.`)).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`^${name},`) })).toHaveCount(0);

  expect(errors).toEqual([]);
});
