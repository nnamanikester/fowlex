import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("add a category with a budget, spend under it, rename it: past expenses take the new name", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  await page.goto("/expenses");
  await page
    .getByRole("navigation", { name: "Expenses sections" })
    .getByRole("link", { name: "Categories and budgets" })
    .click();
  await page.getByRole("button", { name: "Add category" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add a category" });
  await sheet.getByLabel("Name").fill(`Security ${tag}`);
  await sheet.getByLabel("Monthly budget").fill("30000");
  await sheet.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText(`Security ${tag} added.`)).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: new RegExp(`Security ${tag}`) })).toContainText(
    "Budget ₦30,000.00 a month",
  );

  await page.goto("/expenses");
  await page.getByRole("button", { name: "Spend money" }).first().click();
  const spend = page.getByRole("dialog", { name: "Spend money" });
  await spend.getByRole("radio", { name: "Other expense" }).click();
  await spend.getByRole("radio", { name: `Security ${tag}` }).click();
  await spend.getByLabel("Amount").fill("25000");
  await spend.getByLabel("For", { exact: true }).fill(`Night guard ${tag}`);
  await spend.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/EXP-\d{4}-\d{4} recorded\./)).toBeVisible();
  const row = page.getByRole("main").getByRole("button", { name: new RegExp(`Night guard ${tag}`) });
  await expect(row).toContainText(`Security ${tag}`);

  await page.goto("/expenses/categories");
  await page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(`Security ${tag}`) })
    .click();
  const edit = page.getByRole("dialog", { name: `Security ${tag}` });
  await edit.getByLabel("Name").fill(`Guards ${tag}`);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`Guards ${tag} saved.`)).toBeVisible();
  await page.goto("/expenses");
  await expect(row).toContainText(`Guards ${tag}`);
  expect(errors).toEqual([]);
});
