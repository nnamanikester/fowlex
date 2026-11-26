import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";
import { E2E_USERS } from "./users";

test("a change to someone's role shows in the audit log as the owner's, with before and after", async ({ page }) => {
  const errors = watchErrors(page);
  const { name } = E2E_USERS.forgetful;

  await page.goto("/settings/users");
  await page.getByRole("button", { name: `Manage ${name}` }).click();
  await page.getByRole("menuitem", { name: "Make manager" }).click();
  await expect(page.getByText(`${name} is now manager.`)).toBeVisible();

  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page).toHaveURL("/settings/audit");
  await page.getByRole("button", { name: "Who: Anyone" }).click();
  await page.getByRole("menuitem", { name: E2E_USERS.owner.name }).click();

  const row = page.getByRole("row").filter({ hasText: name }).first();
  await expect(row).toContainText(E2E_USERS.owner.name);
  await expect(row).toContainText("Changed");
  if (!test.info().project.use.isMobile) await expect(row).toContainText("Role: staff → manager");

  // Put them back for the other tests.
  await page.goto("/settings/users");
  await page.getByRole("button", { name: `Manage ${name}` }).click();
  await page.getByRole("menuitem", { name: "Make staff" }).click();
  await expect(page.getByText(`${name} is now staff.`)).toBeVisible();
  expect(errors).toEqual([]);
});
