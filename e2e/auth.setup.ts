import { expect, test as setup } from "@playwright/test";

import { E2E_PASSWORD, E2E_USERS } from "./users";

/** Signs in as the owner once and saves the session for every test that needs one. */
setup("sign in as the owner", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(E2E_USERS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await page.context().storageState({ path: "playwright/.auth/owner.json" });
});
