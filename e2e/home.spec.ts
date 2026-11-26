import { expect, test } from "@playwright/test";

test("home page shows the Fowlex logo", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Fowlex/);
  await expect(page.getByRole("img", { name: "Fowlex" })).toBeVisible();
});
