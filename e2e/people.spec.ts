import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("add someone with their bank account, edit their pay, and mark them as left", async ({ page }, info) => {
  const errors = watchErrors(page);
  const name = `Musa ${info.project.name} ${Date.now().toString(36)}`;
  await page.goto("/people");
  await page.getByRole("main").getByRole("button", { name: "Add someone" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add someone" });
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByText("Enter their name.")).toBeVisible();
  await sheet.getByLabel("Name").fill(name);
  await sheet.getByLabel("Job").fill("Farm hand");
  await sheet.getByLabel("Pay a month").fill("60000");
  await sheet.getByLabel("Bank").selectOption({ label: "Guaranty Trust Bank" });
  await sheet.getByLabel("Account number").fill("0123456781");
  await expect(sheet.getByText("CHIOMA EZE")).toBeVisible();
  await sheet.getByLabel("Phone", { exact: true }).fill("08031234567");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`${name} added.`)).toBeVisible();
  // Adding someone opens their page.
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Guaranty Trust Bank ••••6781 · CHIOMA EZE");
  await page.getByRole("main").getByRole("link", { name: "People", exact: true }).first().click();

  const card = page.getByRole("main").getByRole("listitem").filter({ hasText: name });
  await expect(card).toContainText("₦60,000.00 a month");
  await expect(card).toContainText("Guaranty Trust Bank ••••6781");
  await expect(card.getByRole("link", { name: "0803 123 4567" })).toHaveAttribute("href", "tel:+2348031234567");

  await card.getByRole("link", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: "Edit details" }).click();
  const edit = page.getByRole("dialog", { name });
  await edit.getByRole("radio", { name: "By the day" }).click();
  await edit.getByLabel("Pay a day").fill("4500");
  await expect(edit.getByText("Payroll counts the days ticked on the attendance sheet.")).toBeVisible();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`${name} saved.`)).toBeVisible();
  await expect(page.getByRole("main")).toContainText("₦4,500.00 a day");

  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByRole("dialog", { name }).getByRole("button", { name: "Left the farm" }).click();
  await expect(page.getByText(`${name} marked as left.`)).toBeVisible();
  await expect(page.getByRole("heading", { name })).toContainText("Left on");
  await page.goto("/people");
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Show people who left" }).click();
  await expect(card).toContainText("Left");
  expect(errors).toEqual([]);
});
