import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("settings save, survive a reload, and change the next invoice number's prefix", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/settings");
  const prefix = page.getByLabel("Number prefix");
  await expect(prefix).toHaveValue(/^[A-Z0-9]+$/);
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();

  // A bad account number is caught before saving, under its field.
  await page.getByLabel("Account number").fill("12345");
  await save.click();
  await expect(page.getByText("Use the 10-digit account number.")).toBeVisible();
  await expect(page.getByLabel("Account number")).toBeFocused();

  await page.getByLabel("Account number").fill("0123456789");
  await prefix.fill("fwx");
  await expect(prefix).toHaveValue("FWX");
  await expect(page.getByText(/Next invoice: FWX-\d{4}-\d{4}/)).toBeVisible();
  await page.getByLabel("Expense approval limit").fill("250000");
  await save.click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect(save).toBeDisabled();

  await page.reload();
  await expect(prefix).toHaveValue("FWX");
  await expect(page.getByLabel("Account number")).toHaveValue("0123456789");
  await expect(page.getByLabel("Expense approval limit")).toHaveValue("250,000.00");

  // The change is in the audit log.
  await page.goto("/settings/audit");
  await expect(page.getByRole("row").filter({ hasText: "Invoice prefix: INV → FWX" }).first()).toBeAttached();

  // Put it back for the other project's run.
  await page.goto("/settings");
  await prefix.fill("INV");
  await save.click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  expect(errors).toEqual([]);
});
