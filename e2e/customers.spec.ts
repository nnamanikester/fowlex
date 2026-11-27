import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("add a restaurant with 14-day terms and a ₦2,000,000 limit, edit it, and archive it", async ({ page }, info) => {
  const errors = watchErrors(page);
  const name = `Bukka Hut ${info.project.name} ${Date.now().toString(36)}`;
  await page.goto("/customers");
  await page.getByRole("main").getByRole("button", { name: "Add a customer" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add a customer" });
  await sheet.getByRole("button", { name: "Add customer" }).click();
  await expect(sheet.getByText("Enter the customer's name.")).toBeVisible();

  await sheet.getByLabel("Name").fill(name);
  await sheet.getByLabel("Kind of customer").selectOption("restaurant");
  await sheet.getByRole("button", { name: "14 days" }).click();
  await sheet.getByLabel("Most they may owe").fill("2000000");
  await sheet.getByLabel("Contact person").fill("Chidi Okafor");
  await sheet.getByLabel("Phone").fill("0803 123 4567");
  await sheet.getByLabel("Email").fill("orders@bukka.ng");
  await sheet.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByText(`${name} added.`)).toBeVisible();

  // Adding a customer opens their page.
  const main = page.getByRole("main");
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(main).toContainText("Pays in 14 days");
  await expect(main).toContainText("₦2,000,000.00");
  await expect(main.getByRole("link", { name: "0803 123 4567" })).toHaveAttribute("href", "tel:+2348031234567");

  await page.getByRole("button", { name: "Edit details" }).click();
  const edit = page.getByRole("dialog", { name });
  await edit.getByRole("button", { name: "On delivery" }).click();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`${name} saved.`)).toBeVisible();
  await expect(main).toContainText("Pays on delivery");

  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByRole("dialog", { name }).getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText(`${name} archived.`)).toBeVisible();
  await page.goto("/customers");
  const card = main.getByRole("listitem").filter({ hasText: name });
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Show archived customers" }).click();
  await expect(card).toContainText("Archived");
  expect(errors).toEqual([]);
});

test("a second customer with the same name is refused, on the name", async ({ page }, info) => {
  const errors = watchErrors(page, [/status of 409/]);
  const name = `Twin Lounge ${info.project.name} ${Date.now().toString(36)}`;
  await page.request.post("/api/customers", { data: { name, type: "lounge" } });
  await page.goto("/customers");
  await page.getByRole("main").getByRole("button", { name: "Add a customer" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add a customer" });
  await sheet.getByLabel("Name").fill(name.toUpperCase());
  await sheet.getByRole("button", { name: "Add customer" }).click();
  await expect(sheet.getByRole("alert").filter({ hasText: "is already a customer." }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
