import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("record a rent that repeats every month, see when it's next, and stop it", async ({ page }, info) => {
  const errors = watchErrors(page);
  const name = `Pen rent ${info.project.name} ${Date.now().toString(36)}`;
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Spend money" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Spend money" });
  await sheet.getByRole("radio", { name: "Other expense" }).click();
  await sheet.getByRole("radio", { name: "Rent" }).click();
  await sheet.getByLabel("Amount").fill("150000");
  await sheet.getByLabel("For", { exact: true }).fill(name);
  await sheet.getByRole("checkbox", { name: /Repeats every month/ }).check();
  await expect(sheet.getByText(/made again on the \d+(st|nd|rd|th) of each month/)).toBeVisible();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/EXP-\d{4}-\d{4} recorded\./)).toBeVisible();

  const repeat = page.getByRole("main").getByRole("button", { name: new RegExp(`${name}.*next on`) });
  await expect(repeat).toContainText("₦150,000.00");
  // The daily job has nothing to make yet: next month's isn't due.
  const run = await page.request.get("/api/cron/recurring", { headers: { authorization: "Bearer e2e-cron-secret" } });
  expect(run.status()).toBe(200);

  await repeat.click();
  await page.getByRole("dialog", { name }).getByRole("button", { name: "Stop repeating" }).click();
  await expect(page.getByText(`${name} stopped.`)).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("button", { name: new RegExp(name) })
      .first(),
  ).toContainText("Stopped");
  expect(errors).toEqual([]);
});
