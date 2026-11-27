import { expect, test } from "@playwright/test";

import { signInAs, watchErrors } from "./helpers";
import { E2E_USERS } from "./users";

test("add “Starter feed” in 25 kg bags with a reorder level of 10, then find and edit it", async ({ page }, info) => {
  const errors = watchErrors(page);
  const name = `Starter feed ${info.project.name}`;
  await page.goto("/inventory");
  await page
    .getByRole("button", { name: /Add (an )?item/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Add an item" });
  await sheet.getByLabel("Name").fill(name);
  await expect(sheet.getByLabel("Kind")).toHaveValue("feed");
  await expect(sheet.getByLabel("Kg per bag")).toHaveValue("25");
  await sheet.getByLabel(/Reorder below/).fill("10");
  await sheet.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText(`${name} added.`)).toBeVisible();

  const row = page.getByRole("main").getByRole("link", { name: new RegExp(name) });
  await expect(row).toContainText("25 kg bag · reorder below 10 bags");
  await page.getByLabel("Search items").fill(info.project.name);
  await expect(row).toBeVisible();

  await row.click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name });
  await edit.getByLabel(/Reorder below/).fill("12");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`${name} saved.`)).toBeVisible();
  await expect(page.getByText("Reorder below 12 bags")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a feed bag needs its weight, and a name is used once", async ({ page }, info) => {
  const errors = watchErrors(page, [/status of 409/]);
  const name = `Grower feed ${info.project.name}`;
  await page.goto("/inventory");
  await page
    .getByRole("button", { name: /Add (an )?item/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Add an item" });
  await sheet.getByLabel("Name").fill(name);
  await sheet.getByLabel("Kg per bag").fill("");
  await sheet.getByRole("button", { name: "Add item" }).click();
  await expect(sheet.getByText(/Enter the kg in one unit/)).toBeVisible();
  await sheet.getByLabel("Kg per bag").fill("25");
  await sheet.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText(`${name} added.`)).toBeVisible();

  await page
    .getByRole("button", { name: /Add (an )?item/ })
    .first()
    .click();
  await sheet.getByLabel("Name").fill(name.toUpperCase());
  await sheet.getByRole("button", { name: "Add item" }).click();
  await expect(sheet.getByText(/There's already an item called/)).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe("staff", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("see stock but can't change it", async ({ page }) => {
    await signInAs(page, E2E_USERS.staff.email);
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add (an )?item/ })).toHaveCount(0);
    await expect(page.getByText("Add common items")).toHaveCount(0);
  });
});
