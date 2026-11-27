import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("add a supplier with a bank account the bank names before saving", async ({ page }, info) => {
  const errors = watchErrors(page, [/status of 400/]);
  const name = `Amo Byng ${info.project.name}`;
  await page.goto("/suppliers");
  await page
    .getByRole("button", { name: /Add (a )?supplier/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Add a supplier" });
  await sheet.getByLabel("Name").fill(name);
  await sheet.getByRole("button", { name: "Day-old chicks" }).click();
  await sheet.getByLabel("Phone").fill("0803 123 4567");

  await sheet.getByLabel("Bank").selectOption({ label: "Guaranty Trust Bank" });
  await sheet.getByLabel("Account number").fill("0000000000");
  await expect(sheet.getByText("We couldn't find that account. Check the number and the bank.")).toBeVisible();
  await sheet.getByRole("button", { name: "Add supplier" }).click();
  // Not saved: the bank hasn't named the account.
  await expect(sheet.getByLabel("Account number")).toBeFocused();
  await expect(page.getByText(`${name} added.`)).toHaveCount(0);

  await sheet.getByLabel("Account number").fill("0123456781");
  await expect(sheet.getByText("CHIOMA EZE")).toBeVisible();
  await sheet.getByRole("button", { name: "Add supplier" }).click();
  await expect(page.getByText(`${name} added.`)).toBeVisible();

  const card = page.getByRole("main").getByRole("listitem").filter({ hasText: name });
  await expect(card).toContainText("Day-old chicks");
  await expect(card).toContainText("Guaranty Trust Bank ••••6781");
  await expect(card).toContainText("Can pay");
  await expect(card.getByRole("link", { name: "0803 123 4567" })).toHaveAttribute("href", "tel:+2348031234567");
  expect(errors).toEqual([]);
});

test("outside live, the test bank comes first and fills in its test account", async ({ page }, info) => {
  const errors = watchErrors(page);
  const name = `Test payee ${info.project.name} ${Date.now().toString(36)}`;
  await page.goto("/suppliers");
  await page
    .getByRole("button", { name: /Add (a )?supplier/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Add a supplier" });
  await sheet.getByLabel("Name").fill(name);
  await sheet.getByRole("button", { name: "Feed" }).click();
  const bank = sheet.getByLabel("Bank");
  // First after the prompt, in its own group.
  await expect(bank.locator("option").nth(1)).toHaveText("Test Bank (test mode only)");
  await bank.selectOption({ label: "Test Bank (test mode only)" });
  await expect(sheet.getByLabel("Account number")).toHaveValue("0000000000");
  await expect(sheet.getByText("Paystack's test account: no real money moves.")).toBeVisible();
  await expect(sheet.getByText("TEST ACCOUNT", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Add supplier" }).click();
  await expect(page.getByText(`${name} added.`)).toBeVisible();
  expect(errors).toEqual([]);
});
