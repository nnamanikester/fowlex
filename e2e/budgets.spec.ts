import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("a category at 95% of its budget shows the warning, and over it shows how much over", async ({ page }, info) => {
  const errors = watchErrors(page);
  const name = `Generator fuel ${info.project.name} ${Date.now().toString(36)}`;
  const categories = await (
    await page.request.post("/api/expense-categories", { data: { name, monthlyBudgetKobo: 2_000_000 } })
  ).json();
  const key = categories.find((c: { name: string }) => c.name === name).key;
  const spend = (amountKobo: number) =>
    page.request.post("/api/expenses", { data: { category: key, amountKobo, description: "Diesel", method: "cash" } });
  await spend(1_900_000);

  await page.goto("/expenses");
  const bar = page.getByRole("progressbar", { name: `${name} budget` });
  await expect(bar).toHaveAttribute("aria-valuenow", "95");
  await expect(bar).toHaveAttribute("aria-valuetext", "95% used · ₦1,000.00 left");
  await expect(page.getByText("95% used · ₦1,000.00 left")).toBeVisible();

  await spend(200_000);
  await page.reload();
  await expect(bar).toHaveAttribute("aria-valuetext", "₦1,000.00 over");
  await page.goto("/expenses/categories");
  await expect(page.getByRole("progressbar", { name: `${name} budget` })).toHaveAttribute("aria-valuenow", "100");
  expect(errors).toEqual([]);
});
