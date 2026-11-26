import { expect, test } from "@playwright/test";

const canvas = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("design page shows the tokens in light and dark", async ({ page }) => {
  await page.goto("/design");
  await expect(page.getByRole("heading", { name: "Design system" })).toBeVisible();

  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  expect(await canvas(page)).toBe("rgb(248, 244, 237)");

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await canvas(page)).toBe("rgb(10, 19, 23)");

  // The choice survives a reload.
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
